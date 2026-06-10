package com.creatoros.api.service;

import com.creatoros.api.dto.*;
import com.creatoros.api.model.*;
import com.creatoros.api.repository.UserRepository;
import com.creatoros.api.repository.WorkspaceRepository;
import com.creatoros.api.repository.CreatorProfileRepository;
import com.creatoros.api.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final WorkspaceRepository workspaceRepository;
    private final CreatorProfileRepository creatorProfileRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final AuthenticationManager authenticationManager;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.findByEmail(request.getEmail()).isPresent()) {
            throw new IllegalArgumentException("Email is already registered");
        }

        User user = User.builder()
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .role(Role.CREATOR)
                .build();

        User savedUser = userRepository.save(user);

        // Create default workspace
        String workspaceName = request.getWorkspaceName();
        if (workspaceName == null || workspaceName.trim().isEmpty()) {
            workspaceName = "My Brand";
        }
        
        String slug = workspaceName.toLowerCase()
                .replaceAll("[^a-z0-9\\s-]", "")
                .replaceAll("\\s+", "-")
                .replaceAll("-+", "-")
                .replaceAll("^-|-$", "");
        if (slug.isEmpty()) {
            slug = "workspace";
        }
        slug = slug + "-" + UUID.randomUUID().toString().substring(0, 8);

        Workspace workspace = Workspace.builder()
                .creator(savedUser)
                .name(workspaceName)
                .slug(slug)
                .build();

        // Create default blank profile and associate it
        CreatorProfile profile = CreatorProfile.builder()
                .workspace(workspace)
                .creatorName("")
                .niche("")
                .primaryPlatform("")
                .targetAudience("")
                .contentStyle("")
                .brandVoice("")
                .growthGoal("")
                .postingFrequency("")
                .build();
        workspace.setCreatorProfile(profile);

        Workspace savedWorkspace = workspaceRepository.save(workspace);

        // Set active workspace
        savedUser.setActiveWorkspace(savedWorkspace);

        // Generate tokens
        String accessToken = jwtTokenProvider.generateAccessToken(savedUser);
        String refreshToken = jwtTokenProvider.generateRefreshToken();

        savedUser.setRefreshToken(refreshToken);
        savedUser.setRefreshTokenExpiresAt(Instant.now().plusMillis(jwtTokenProvider.getRefreshExpirationInMs()));
        userRepository.save(savedUser);

        return buildAuthResponse(savedUser, accessToken, refreshToken, List.of(savedWorkspace));
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
        );

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));

        String accessToken = jwtTokenProvider.generateAccessToken(user);
        String refreshToken = jwtTokenProvider.generateRefreshToken();

        user.setRefreshToken(refreshToken);
        user.setRefreshTokenExpiresAt(Instant.now().plusMillis(jwtTokenProvider.getRefreshExpirationInMs()));
        userRepository.save(user);

        List<Workspace> workspaces = workspaceRepository.findByCreatorId(user.getId());

        return buildAuthResponse(user, accessToken, refreshToken, workspaces);
    }

    @Transactional
    public AuthResponse googleMockLogin(GoogleMockRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseGet(() -> {
                    // Create new user if not exists
                    String randomPassword = java.util.UUID.randomUUID().toString();
                    User newUser = User.builder()
                            .email(request.getEmail())
                            .password(passwordEncoder.encode(randomPassword))
                            .role(Role.CREATOR)
                            .build();
                    User savedUser = userRepository.save(newUser);

                    // Create default workspace
                    String workspaceName = request.getName() + "'s Workspace";
                    String slug = workspaceName.toLowerCase()
                            .replaceAll("[^a-z0-9\\s-]", "")
                            .replaceAll("\\s+", "-")
                            .replaceAll("-+", "-")
                            .replaceAll("^-|-$", "");
                    if (slug.isEmpty()) {
                        slug = "workspace";
                    }
                    slug = slug + "-" + java.util.UUID.randomUUID().toString().substring(0, 8);

                    Workspace workspace = Workspace.builder()
                            .creator(savedUser)
                            .name(workspaceName)
                            .slug(slug)
                            .build();

                    // Create default blank profile and associate it
                    CreatorProfile profile = CreatorProfile.builder()
                            .workspace(workspace)
                            .creatorName(request.getName())
                            .niche("")
                            .primaryPlatform("")
                            .targetAudience("")
                            .contentStyle("")
                            .brandVoice("")
                            .growthGoal("")
                            .postingFrequency("")
                            .build();
                    workspace.setCreatorProfile(profile);
                    Workspace savedWorkspace = workspaceRepository.save(workspace);

                    savedUser.setActiveWorkspace(savedWorkspace);
                    return userRepository.save(savedUser);
                });

        // Generate tokens
        String accessToken = jwtTokenProvider.generateAccessToken(user);
        String refreshToken = jwtTokenProvider.generateRefreshToken();

        user.setRefreshToken(refreshToken);
        user.setRefreshTokenExpiresAt(Instant.now().plusMillis(jwtTokenProvider.getRefreshExpirationInMs()));
        userRepository.save(user);

        List<Workspace> workspaces = workspaceRepository.findByCreatorId(user.getId());

        return buildAuthResponse(user, accessToken, refreshToken, workspaces);
    }

    @Transactional
    public AuthResponse refresh(RefreshRequest request) {
        User user = userRepository.findByRefreshToken(request.getRefreshToken())
                .orElseThrow(() -> new IllegalArgumentException("Invalid refresh token"));

        if (user.getRefreshTokenExpiresAt().isBefore(Instant.now())) {
            throw new IllegalArgumentException("Refresh token is expired");
        }

        String accessToken = jwtTokenProvider.generateAccessToken(user);
        String newRefreshToken = jwtTokenProvider.generateRefreshToken();

        user.setRefreshToken(newRefreshToken);
        user.setRefreshTokenExpiresAt(Instant.now().plusMillis(jwtTokenProvider.getRefreshExpirationInMs()));
        userRepository.save(user);

        List<Workspace> workspaces = workspaceRepository.findByCreatorId(user.getId());

        return buildAuthResponse(user, accessToken, newRefreshToken, workspaces);
    }

    @Transactional(readOnly = true)
    public void forgotPassword(ForgotPasswordRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new IllegalArgumentException("Email not found"));
        // Mocking email dispatch as per architecture guidelines (Phase 2 core focus on auth/shell)
        System.out.println("MOCK EMAIL DISPATCH: Send password reset link to user " + user.getEmail());
    }

    private AuthResponse buildAuthResponse(User user, String accessToken, String refreshToken, List<Workspace> workspaces) {
        UserDto userDto = UserDto.builder()
                .id(user.getId())
                .email(user.getEmail())
                .role(user.getRole().name())
                .profileImage(user.getProfileImage())
                .activeWorkspaceId(user.getActiveWorkspace() != null ? user.getActiveWorkspace().getId() : null)
                .build();

        List<WorkspaceDto> workspaceDtos = workspaces.stream()
                .map(w -> WorkspaceDto.builder()
                        .id(w.getId())
                        .name(w.getName())
                        .slug(w.getSlug())
                        .createdAt(w.getCreatedAt())
                        .updatedAt(w.getUpdatedAt())
                        .build())
                .collect(Collectors.toList());

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .user(userDto)
                .workspaces(workspaceDtos)
                .build();
    }
}
