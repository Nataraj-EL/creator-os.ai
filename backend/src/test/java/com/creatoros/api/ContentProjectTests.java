package com.creatoros.api;

import com.creatoros.api.dto.*;
import com.creatoros.api.model.User;
import com.creatoros.api.model.Workspace;
import com.creatoros.api.repository.ContentProjectRepository;
import com.creatoros.api.repository.UserRepository;
import com.creatoros.api.service.ContentProjectService;
import com.creatoros.api.service.CreatorProfileService;
import com.creatoros.api.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
public class ContentProjectTests {

    @Autowired
    private UserService userService;

    @Autowired
    private CreatorProfileService creatorProfileService;

    @Autowired
    private ContentProjectService contentProjectService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ContentProjectRepository contentProjectRepository;

    private User testUser1;
    private Workspace testWorkspace1;

    private User testUser2;
    private Workspace testWorkspace2;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();

        // Register User 1
        RegisterRequest registerRequest1 = new RegisterRequest();
        registerRequest1.setEmail("user1@creatoros.ai");
        registerRequest1.setPassword("Password123!");
        registerRequest1.setWorkspaceName("User 1 Workspace");

        userService.register(registerRequest1);
        testUser1 = userRepository.findByEmail("user1@creatoros.ai").orElseThrow();
        testWorkspace1 = testUser1.getActiveWorkspace();

        // Complete Creator Profile for User 1 to have stable generation inputs
        CreatorProfileDto profileDto1 = CreatorProfileDto.builder()
                .creatorName("Tech AI Reviewer")
                .niche("AI & Machine Learning")
                .primaryPlatform("YouTube")
                .postingFrequency("Weekly")
                .brandVoice("Informative and Engaging")
                .build();
        creatorProfileService.updateProfile(testUser1, testWorkspace1.getId(), profileDto1);

        // Register User 2
        RegisterRequest registerRequest2 = new RegisterRequest();
        registerRequest2.setEmail("user2@creatoros.ai");
        registerRequest2.setPassword("Password123!");
        registerRequest2.setWorkspaceName("User 2 Workspace");

        userService.register(registerRequest2);
        testUser2 = userRepository.findByEmail("user2@creatoros.ai").orElseThrow();
        testWorkspace2 = testUser2.getActiveWorkspace();
    }

    @Test
    void testCreateAndReadProject() {
        CreateContentProjectRequest request = new CreateContentProjectRequest();
        request.setTitle("Unlocking AI Growth");
        request.setTopic("How to learn AI in 2026 without a computer science degree");

        ContentProjectDto created = contentProjectService.createProject(testUser1, testWorkspace1.getId(), request);
        assertNotNull(created);
        assertEquals("Unlocking AI Growth", created.getTitle());
        assertEquals("How to learn AI in 2026 without a computer science degree", created.getTopic());
        assertNotNull(created.getHook());
        assertNotNull(created.getScript());
        assertNotNull(created.getCta());
        assertEquals("DRAFT", created.getStatus());
        assertFalse(created.getVariants().isEmpty());

        // Get single project
        ContentProjectDto retrieved = contentProjectService.getProject(testUser1, testWorkspace1.getId(), created.getProjectId());
        assertNotNull(retrieved);
        assertEquals(created.getProjectId(), retrieved.getProjectId());
        assertEquals("Unlocking AI Growth", retrieved.getTitle());

        // List projects
        List<ContentProjectDto> list = contentProjectService.listProjects(testUser1, testWorkspace1.getId());
        assertEquals(1, list.size());
        assertEquals(created.getProjectId(), list.get(0).getProjectId());
    }

    @Test
    void testUpdateProject() {
        CreateContentProjectRequest createRequest = new CreateContentProjectRequest();
        createRequest.setTitle("Initial Title");
        createRequest.setTopic("Topic text");
        ContentProjectDto created = contentProjectService.createProject(testUser1, testWorkspace1.getId(), createRequest);

        UpdateContentProjectRequest updateRequest = new UpdateContentProjectRequest();
        updateRequest.setTitle("Updated Title");
        updateRequest.setHook("Custom Hook Value");
        updateRequest.setScript("Custom Script Body");
        updateRequest.setCta("Custom CTA Link");
        updateRequest.setStatus("COMPLETED");

        ContentProjectDto updated = contentProjectService.updateProject(
                testUser1, testWorkspace1.getId(), created.getProjectId(), updateRequest);

        assertEquals("Updated Title", updated.getTitle());
        assertEquals("Custom Hook Value", updated.getHook());
        assertEquals("Custom Script Body", updated.getScript());
        assertEquals("Custom CTA Link", updated.getCta());
        assertEquals("COMPLETED", updated.getStatus());
    }

    @Test
    void testSoftDeleteProject() {
        CreateContentProjectRequest request = new CreateContentProjectRequest();
        request.setTitle("Delete Me");
        request.setTopic("Topic to delete");
        ContentProjectDto created = contentProjectService.createProject(testUser1, testWorkspace1.getId(), request);

        // Delete
        contentProjectService.deleteProject(testUser1, testWorkspace1.getId(), created.getProjectId());

        // Should not be listed
        List<ContentProjectDto> list = contentProjectService.listProjects(testUser1, testWorkspace1.getId());
        assertTrue(list.isEmpty());

        // Should throw when retrieving
        assertThrows(IllegalArgumentException.class, () -> 
            contentProjectService.getProject(testUser1, testWorkspace1.getId(), created.getProjectId())
        );
    }

    @Test
    void testDuplication() {
        CreateContentProjectRequest request = new CreateContentProjectRequest();
        request.setTitle("Original Project");
        request.setTopic("Topic to duplicate");
        ContentProjectDto original = contentProjectService.createProject(testUser1, testWorkspace1.getId(), request);

        // Duplicate
        ContentProjectDto duplicate = contentProjectService.duplicateProject(testUser1, testWorkspace1.getId(), original.getProjectId());

        assertNotNull(duplicate);
        assertNotEquals(original.getProjectId(), duplicate.getProjectId());
        assertEquals("Original Project - Copy", duplicate.getTitle());
        assertEquals(original.getTopic(), duplicate.getTopic());
        assertEquals(original.getHook(), duplicate.getHook());
        assertEquals(original.getScript(), duplicate.getScript());
        assertEquals(original.getCta(), duplicate.getCta());
        assertEquals("DRAFT", duplicate.getStatus());
        assertEquals(original.getVariants().size(), duplicate.getVariants().size());
    }

    @Test
    void testGenerationDeterminism() {
        // Run generation 1
        CreateContentProjectRequest request1 = new CreateContentProjectRequest();
        request1.setTitle("Title 1");
        request1.setTopic("Deterministic AI Topic");
        ContentProjectDto project1 = contentProjectService.createProject(testUser1, testWorkspace1.getId(), request1);

        // Run generation 2 (with same topic and user workspace profile)
        CreateContentProjectRequest request2 = new CreateContentProjectRequest();
        request2.setTitle("Title 2");
        request2.setTopic("Deterministic AI Topic");
        ContentProjectDto project2 = contentProjectService.createProject(testUser1, testWorkspace1.getId(), request2);

        // Compare generated script, hooks, ctas - they should be identical (excluding variant UUIDs and project IDs)
        assertEquals(project1.getHook(), project2.getHook());
        assertEquals(project1.getScript(), project2.getScript());
        assertEquals(project1.getCta(), project2.getCta());
    }

    @Test
    void testWorkspaceIsolation() {
        // Create project in Workspace 1
        CreateContentProjectRequest request = new CreateContentProjectRequest();
        request.setTitle("Workspace 1 Project");
        request.setTopic("Isolation Topic");
        ContentProjectDto project = contentProjectService.createProject(testUser1, testWorkspace1.getId(), request);

        // User 2 in Workspace 2 tries to read project of Workspace 1 -> should throw unauthorized / not found
        assertThrows(IllegalArgumentException.class, () -> 
            contentProjectService.getProject(testUser2, testWorkspace2.getId(), project.getProjectId())
        );

        // User 1 in Workspace 1 tries to read with Workspace 2 ID -> should throw unauthorized
        assertThrows(IllegalArgumentException.class, () -> 
            contentProjectService.getProject(testUser1, testWorkspace2.getId(), project.getProjectId())
        );

        // User 2 tries to list Workspace 1 projects -> should throw unauthorized
        assertThrows(IllegalArgumentException.class, () -> 
            contentProjectService.listProjects(testUser2, testWorkspace1.getId())
        );

        // User 2 tries to duplicate Workspace 1 project -> should throw unauthorized
        assertThrows(IllegalArgumentException.class, () -> 
            contentProjectService.duplicateProject(testUser2, testWorkspace2.getId(), project.getProjectId())
        );
    }
}
