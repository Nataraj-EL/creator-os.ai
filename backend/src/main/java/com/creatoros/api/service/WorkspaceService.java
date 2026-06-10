package com.creatoros.api.service;

import com.creatoros.api.dto.WorkspaceDto;
import com.creatoros.api.dto.WorkspaceRequest;
import com.creatoros.api.model.CreatorProfile;
import com.creatoros.api.model.User;
import com.creatoros.api.model.Workspace;
import com.creatoros.api.repository.CreatorProfileRepository;
import com.creatoros.api.repository.UserRepository;
import com.creatoros.api.repository.WorkspaceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class WorkspaceService {

    private final WorkspaceRepository workspaceRepository;
    private final CreatorProfileRepository creatorProfileRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<WorkspaceDto> listWorkspaces(User creator) {
        return workspaceRepository.findByCreatorId(creator.getId()).stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Transactional
    public WorkspaceDto createWorkspace(User creator, WorkspaceRequest request) {
        if (workspaceRepository.existsByCreatorIdAndName(creator.getId(), request.getName())) {
            throw new IllegalArgumentException("A workspace with name '" + request.getName() + "' already exists.");
        }

        Workspace workspace = Workspace.builder()
                .creator(creator)
                .name(request.getName())
                .slug(generateUniqueSlug(request.getName()))
                .build();

        // Auto-create default blank profile and associate it
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

        // Set active if user has no active workspace
        User user = userRepository.findById(creator.getId()).orElseThrow();
        if (user.getActiveWorkspace() == null) {
            user.setActiveWorkspace(savedWorkspace);
            userRepository.save(user);
        }

        return mapToDto(savedWorkspace);
    }

    @Transactional
    public WorkspaceDto updateWorkspace(User creator, UUID id, WorkspaceRequest request) {
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(id, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        // If name changes, verify unique constraint
        if (!workspace.getName().equalsIgnoreCase(request.getName())) {
            if (workspaceRepository.existsByCreatorIdAndName(creator.getId(), request.getName())) {
                throw new IllegalArgumentException("A workspace with name '" + request.getName() + "' already exists.");
            }
            workspace.setName(request.getName());
            workspace.setSlug(generateUniqueSlug(request.getName()));
        }

        Workspace updatedWorkspace = workspaceRepository.save(workspace);
        return mapToDto(updatedWorkspace);
    }

    @Transactional
    public void softDeleteWorkspace(User creator, UUID id) {
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(id, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        workspace.setDeleted(true);
        workspaceRepository.save(workspace);

        // Fallback for active workspace
        User user = userRepository.findById(creator.getId()).orElseThrow();
        if (user.getActiveWorkspace() != null && user.getActiveWorkspace().getId().equals(id)) {
            List<Workspace> activeWorkspaces = workspaceRepository.findByCreatorId(creator.getId());
            if (!activeWorkspaces.isEmpty()) {
                user.setActiveWorkspace(activeWorkspaces.get(0));
            } else {
                user.setActiveWorkspace(null);
            }
            userRepository.save(user);
        }
    }

    @Transactional
    public WorkspaceDto activateWorkspace(User creator, UUID id) {
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(id, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        User user = userRepository.findById(creator.getId()).orElseThrow();
        user.setActiveWorkspace(workspace);
        userRepository.save(user);

        return mapToDto(workspace);
    }

    private WorkspaceDto mapToDto(Workspace workspace) {
        return WorkspaceDto.builder()
                .id(workspace.getId())
                .name(workspace.getName())
                .slug(workspace.getSlug())
                .createdAt(workspace.getCreatedAt())
                .updatedAt(workspace.getUpdatedAt())
                .build();
    }

    private String generateUniqueSlug(String name) {
        String baseSlug = name.toLowerCase()
                .replaceAll("[^a-z0-9\\s-]", "")
                .replaceAll("\\s+", "-")
                .replaceAll("-+", "-")
                .replaceAll("^-|-$", "");
        if (baseSlug.isEmpty()) {
            baseSlug = "workspace";
        }
        return baseSlug + "-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
