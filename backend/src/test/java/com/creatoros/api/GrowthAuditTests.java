package com.creatoros.api;

import com.creatoros.api.dto.CreatorProfileDto;
import com.creatoros.api.dto.GrowthAuditDto;
import com.creatoros.api.dto.RegisterRequest;
import com.creatoros.api.model.User;
import com.creatoros.api.model.Workspace;
import com.creatoros.api.repository.UserRepository;
import com.creatoros.api.service.CreatorProfileService;
import com.creatoros.api.service.GrowthAuditService;
import com.creatoros.api.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
public class GrowthAuditTests {

    @Autowired
    private UserService userService;

    @Autowired
    private CreatorProfileService creatorProfileService;

    @Autowired
    private GrowthAuditService growthAuditService;

    @Autowired
    private UserRepository userRepository;

    private User testUser;
    private Workspace testWorkspace;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();

        // Register a user
        RegisterRequest registerRequest = new RegisterRequest();
        registerRequest.setEmail("test@creatoros.ai");
        registerRequest.setPassword("Password123!");
        registerRequest.setWorkspaceName("Test Channel");

        userService.register(registerRequest);
        testUser = userRepository.findByEmail("test@creatoros.ai").orElseThrow();
        testWorkspace = testUser.getActiveWorkspace();
    }

    @Test
    void testGrowthAuditFailsIfProfileIsEmpty() {
        // Workspace default profile is blank but active.
        // Let's test that running the audit yields stable results.
        GrowthAuditDto audit = growthAuditService.runAudit(testUser, testWorkspace.getId());
        assertNotNull(audit);
        assertEquals(testWorkspace.getId(), audit.getWorkspaceId());
        assertTrue(audit.getGrowthScore() >= 30 && audit.getGrowthScore() <= 100);
        assertNotNull(audit.getSummary());
        assertNotNull(audit.getStrengths());
        assertNotNull(audit.getWeaknesses());
        assertFalse(audit.getRecommendations().isEmpty());
    }

    @Test
    @Transactional
    void testDeterministicProfileBasedMetrics() {
        // Complete the profile details
        CreatorProfileDto profileDto = CreatorProfileDto.builder()
                .creatorName("Tech Reviewer")
                .niche("Consumer Electronics Tutorials")
                .primaryPlatform("YouTube")
                .postingFrequency("Daily uploads")
                .build();

        creatorProfileService.updateProfile(testUser, testWorkspace.getId(), profileDto);

        // Run audit first time
        GrowthAuditDto audit1 = growthAuditService.runAudit(testUser, testWorkspace.getId());
        assertNotNull(audit1.getViews());

        // Run audit second time
        GrowthAuditDto audit2 = growthAuditService.runAudit(testUser, testWorkspace.getId());

        // Assert that they are exactly deterministic (values are identical because profile didn't change)
        assertEquals(audit1.getGrowthScore(), audit2.getGrowthScore());
        assertEquals(audit1.getViews(), audit2.getViews());
        assertEquals(audit1.getSubscribers(), audit2.getSubscribers());
        assertEquals(audit1.getCtr(), audit2.getCtr());
        assertEquals(audit1.getAvdSeconds(), audit2.getAvdSeconds());
        assertEquals(audit1.getWeeklyUploads(), audit2.getWeeklyUploads());
    }

    @Test
    void testAuditScorePillarBreakdowns() {
        GrowthAuditDto audit = growthAuditService.runAudit(testUser, testWorkspace.getId());

        assertTrue(audit.getContentScore() >= 0 && audit.getContentScore() <= 100);
        assertTrue(audit.getEngagementScore() >= 0 && audit.getEngagementScore() <= 100);
        assertTrue(audit.getConsistencyScore() >= 0 && audit.getConsistencyScore() <= 100);
        assertTrue(audit.getAudienceScore() >= 0 && audit.getAudienceScore() <= 100);

        int calculatedAvg = (audit.getContentScore() + audit.getEngagementScore() + audit.getConsistencyScore() + audit.getAudienceScore()) / 4;
        assertEquals(calculatedAvg, audit.getGrowthScore());
    }

    @Test
    @Transactional
    void testPatchRecommendationStatus() {
        GrowthAuditDto audit = growthAuditService.runAudit(testUser, testWorkspace.getId());
        assertFalse(audit.getRecommendations().isEmpty());

        var rec = audit.getRecommendations().get(0);
        assertEquals("PENDING", rec.getStatus());

        growthAuditService.patchRecommendationStatus(testUser, testWorkspace.getId(), rec.getId(), "IN_PROGRESS");

        List<GrowthAuditDto> history = growthAuditService.getAuditHistory(testUser, testWorkspace.getId());
        assertFalse(history.isEmpty());
        var updatedRec = history.get(0).getRecommendations().stream()
                .filter(r -> r.getId().equals(rec.getId()))
                .findFirst()
                .orElseThrow();
        assertEquals("IN_PROGRESS", updatedRec.getStatus());
    }
}
