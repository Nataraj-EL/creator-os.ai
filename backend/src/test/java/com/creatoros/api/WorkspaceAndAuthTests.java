package com.creatoros.api;

import com.creatoros.api.dto.RegisterRequest;
import com.creatoros.api.dto.WorkspaceDto;
import com.creatoros.api.dto.WorkspaceRequest;
import com.creatoros.api.dto.GoogleMockRequest;
import com.creatoros.api.dto.AuthResponse;
import com.creatoros.api.model.User;
import com.creatoros.api.repository.UserRepository;
import com.creatoros.api.service.UserService;
import com.creatoros.api.service.WorkspaceService;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
public class WorkspaceAndAuthTests {

    @Autowired
    private UserService userService;

    @Autowired
    private WorkspaceService workspaceService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private Validator validator;

    private User testUser;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();

        // Register a user
        RegisterRequest registerRequest = new RegisterRequest();
        registerRequest.setEmail("test@creatoros.ai");
        registerRequest.setPassword("Password123!");
        registerRequest.setWorkspaceName("Test Workspace");

        userService.register(registerRequest);
        testUser = userRepository.findByEmail("test@creatoros.ai").orElseThrow();
    }

    @Test
    void testRegistrationCreatesDefaultWorkspaceAndProfile() {
        assertNotNull(testUser.getActiveWorkspace());
        assertEquals("Test Workspace", testUser.getActiveWorkspace().getName());
        assertNotNull(testUser.getActiveWorkspace().getSlug());

        List<WorkspaceDto> workspaces = workspaceService.listWorkspaces(testUser);
        assertEquals(1, workspaces.size());
        assertEquals("Test Workspace", workspaces.get(0).getName());
    }

    @Test
    void testCreateWorkspaceUniqueNameConstraint() {
        WorkspaceRequest request = new WorkspaceRequest();
        request.setName("New Workspace");

        workspaceService.createWorkspace(testUser, request);

        // Try creating with duplicate name, should throw exception
        assertThrows(IllegalArgumentException.class, () -> {
            workspaceService.createWorkspace(testUser, request);
        });
    }

    @Test
    void testWorkspaceSoftDeleteAndActiveWorkspaceFallback() {
        // Create second workspace
        WorkspaceRequest request = new WorkspaceRequest();
        request.setName("Workspace Two");
        WorkspaceDto w2 = workspaceService.createWorkspace(testUser, request);

        // Set w2 active
        workspaceService.activateWorkspace(testUser, w2.getId());

        // Refresh testUser
        testUser = userRepository.findById(testUser.getId()).orElseThrow();
        assertEquals(w2.getId(), testUser.getActiveWorkspace().getId());

        // Soft delete active workspace (w2)
        workspaceService.softDeleteWorkspace(testUser, w2.getId());

        // Refresh testUser
        testUser = userRepository.findById(testUser.getId()).orElseThrow();

        // Active workspace should fallback to first remaining workspace (which is the default one)
        assertNotNull(testUser.getActiveWorkspace());
        assertNotEquals(w2.getId(), testUser.getActiveWorkspace().getId());

        // List workspaces should only return 1 active workspace (excluding the soft-deleted one)
        List<WorkspaceDto> workspaces = workspaceService.listWorkspaces(testUser);
        assertEquals(1, workspaces.size());
    }

    @Test
    void testEmailValidationRegex() {
        RegisterRequest request = new RegisterRequest();
        request.setPassword("Password123!");
        request.setWorkspaceName("Test");

        // Invalid emails
        String[] invalidEmails = {
            "abc", "abc@", "@gmail.com", "user@gmail", "user@.com"
        };
        for (String email : invalidEmails) {
            request.setEmail(email);
            Set<ConstraintViolation<RegisterRequest>> violations = validator.validate(request);
            assertFalse(violations.isEmpty(), "Email should be invalid: " + email);
        }

        // Valid email (including typo domain but valid format)
        request.setEmail("user@gamil.com");
        Set<ConstraintViolation<RegisterRequest>> violations = validator.validate(request);
        assertTrue(violations.isEmpty(), "Email should be valid: user@gamil.com");
    }

    @Test
    void testPasswordStrengthRegex() {
        RegisterRequest request = new RegisterRequest();
        request.setEmail("valid@creatoros.ai");
        request.setWorkspaceName("Test");

        // Weak passwords
        String[] weakPasswords = {
            "123", // too short
            "12345678", // no letters
            "abcdefgh", // no upper/number
            "Abcdefgh", // no number/special
            "Abcdefg1", // no special
            "Abcdefg!" // no number
        };
        for (String pw : weakPasswords) {
            request.setPassword(pw);
            Set<ConstraintViolation<RegisterRequest>> violations = validator.validate(request);
            assertFalse(violations.isEmpty(), "Password should be invalid: " + pw);
        }

        // Strong password
        request.setPassword("P@ssword1");
        Set<ConstraintViolation<RegisterRequest>> violations = validator.validate(request);
        assertTrue(violations.isEmpty(), "Password should be valid: P@ssword1");
    }

    @Test
    void testGoogleMockLoginCreatesUserAndWorkspace() {
        GoogleMockRequest request = new GoogleMockRequest();
        request.setEmail("google-user@creatoros.ai");
        request.setName("Google Creator");

        AuthResponse response = userService.googleMockLogin(request);
        assertNotNull(response);
        assertNotNull(response.getAccessToken());
        assertNotNull(response.getRefreshToken());
        assertEquals("google-user@creatoros.ai", response.getUser().getEmail());

        // Verify user exists in repository
        User googleUser = userRepository.findByEmail("google-user@creatoros.ai").orElseThrow();
        assertNotNull(googleUser.getActiveWorkspace());
        assertEquals("Google Creator's Workspace", googleUser.getActiveWorkspace().getName());

        // Subsequent login with same email should return the same user (not duplicate it)
        AuthResponse secondResponse = userService.googleMockLogin(request);
        assertEquals(response.getUser().getId(), secondResponse.getUser().getId());
    }
}
