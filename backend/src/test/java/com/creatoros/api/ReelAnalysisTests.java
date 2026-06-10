package com.creatoros.api;

import com.creatoros.api.dto.CreateContentProjectRequest;
import com.creatoros.api.dto.CreatorProfileDto;
import com.creatoros.api.dto.RegisterRequest;
import com.creatoros.api.dto.ReelAnalysisDto;
import com.creatoros.api.dto.ReelAnalysisResponse;
import com.creatoros.api.model.User;
import com.creatoros.api.model.Workspace;
import com.creatoros.api.repository.UserRepository;
import com.creatoros.api.service.CreatorProfileService;
import com.creatoros.api.service.ReelAnalyzerService;
import com.creatoros.api.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
public class ReelAnalysisTests {

    @Autowired
    private UserService userService;

    @Autowired
    private CreatorProfileService creatorProfileService;

    @Autowired
    private ReelAnalyzerService reelAnalyzerService;

    @Autowired
    private UserRepository userRepository;

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
    void testUploadAndRetrieveReelAnalysis() throws Exception {
        // Mock standard MP4 upload (size 5 MB)
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "nextjs_tutorial.mp4",
                "video/mp4",
                new byte[5 * 1024 * 1024]
        );

        ReelAnalysisResponse response = reelAnalyzerService.analyzeReel(testUser1, testWorkspace1.getId(), file, null);
        assertNotNull(response);
        assertNotNull(response.getAnalysisId());
        assertTrue(response.getOverallScore() >= 40 && response.getOverallScore() <= 100);

        // Get single analysis details
        ReelAnalysisDto details = reelAnalyzerService.getAnalysis(testUser1, testWorkspace1.getId(), response.getAnalysisId());
        assertNotNull(details);
        assertEquals("Nextjs tutorial", details.getTitle());
        assertEquals("nextjs_tutorial.mp4", details.getOriginalFilename());
        assertEquals(5, details.getDurationSeconds()); // 5MB -> 5s estimated duration
        assertFalse(details.getStrengths().isEmpty());
        assertFalse(details.getWeaknesses().isEmpty());
        assertFalse(details.getRecommendations().isEmpty());

        // List history
        List<ReelAnalysisDto> history = reelAnalyzerService.listAnalyses(testUser1, testWorkspace1.getId());
        assertEquals(1, history.size());
        assertEquals(response.getAnalysisId(), history.get(0).getAnalysisId());
    }

    @Test
    void testDeterministicScores() throws Exception {
        MockMultipartFile file1 = new MockMultipartFile(
                "file",
                "viral_reel.mp4",
                "video/mp4",
                new byte[10 * 1024 * 1024]
        );

        MockMultipartFile file2 = new MockMultipartFile(
                "file",
                "viral_reel.mp4",
                "video/mp4",
                new byte[10 * 1024 * 1024]
        );

        // Run upload analysis 1
        ReelAnalysisResponse res1 = reelAnalyzerService.analyzeReel(testUser1, testWorkspace1.getId(), file1, null);
        ReelAnalysisDto details1 = reelAnalyzerService.getAnalysis(testUser1, testWorkspace1.getId(), res1.getAnalysisId());

        // Run upload analysis 2
        ReelAnalysisResponse res2 = reelAnalyzerService.analyzeReel(testUser1, testWorkspace1.getId(), file2, null);
        ReelAnalysisDto details2 = reelAnalyzerService.getAnalysis(testUser1, testWorkspace1.getId(), res2.getAnalysisId());

        // Compare all generated scores, they must be 100% identical since same inputs produce same hashes
        assertEquals(details1.getHookScore(), details2.getHookScore());
        assertEquals(details1.getRetentionScore(), details2.getRetentionScore());
        assertEquals(details1.getCtaScore(), details2.getCtaScore());
        assertEquals(details1.getContentScore(), details2.getContentScore());
        assertEquals(details1.getOverallScore(), details2.getOverallScore());
    }

    @Test
    void testSoftDelete() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "to_delete.mp4",
                "video/mp4",
                new byte[1024 * 1024]
        );

        ReelAnalysisResponse response = reelAnalyzerService.analyzeReel(testUser1, testWorkspace1.getId(), file, null);
        
        // Delete analysis
        reelAnalyzerService.deleteAnalysis(testUser1, testWorkspace1.getId(), response.getAnalysisId());

        // Verify it is excluded from list queries
        List<ReelAnalysisDto> history = reelAnalyzerService.listAnalyses(testUser1, testWorkspace1.getId());
        assertTrue(history.isEmpty());

        // Verify it throws when fetching details directly
        assertThrows(IllegalArgumentException.class, () ->
            reelAnalyzerService.getAnalysis(testUser1, testWorkspace1.getId(), response.getAnalysisId())
        );
    }

    @Test
    void testWorkspaceIsolation() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "isolated_reel.mp4",
                "video/mp4",
                new byte[1024 * 1024]
        );

        ReelAnalysisResponse response = reelAnalyzerService.analyzeReel(testUser1, testWorkspace1.getId(), file, null);

        // User 2 in Workspace 2 tries to read Workspace 1 analysis -> should fail
        assertThrows(IllegalArgumentException.class, () ->
            reelAnalyzerService.getAnalysis(testUser2, testWorkspace2.getId(), response.getAnalysisId())
        );

        // User 1 in Workspace 1 tries to request with Workspace 2 ID -> should fail
        assertThrows(IllegalArgumentException.class, () ->
            reelAnalyzerService.getAnalysis(testUser1, testWorkspace2.getId(), response.getAnalysisId())
        );

        // User 2 tries to list Workspace 1 analyses -> should fail
        assertThrows(IllegalArgumentException.class, () ->
            reelAnalyzerService.listAnalyses(testUser2, testWorkspace1.getId())
        );

        // User 2 tries to delete Workspace 1 analysis -> should fail
        assertThrows(IllegalArgumentException.class, () ->
            reelAnalyzerService.deleteAnalysis(testUser2, testWorkspace1.getId(), response.getAnalysisId())
        );
    }

    @Test
    void testInstagramUrlReelAnalysis() throws Exception {
        String reelUrl = "https://www.instagram.com/reel/C8W-8Jbxg8a/";
        ReelAnalysisResponse response = reelAnalyzerService.analyzeReel(testUser1, testWorkspace1.getId(), null, reelUrl);
        assertNotNull(response);
        assertNotNull(response.getAnalysisId());

        ReelAnalysisDto details = reelAnalyzerService.getAnalysis(testUser1, testWorkspace1.getId(), response.getAnalysisId());
        assertNotNull(details);
        assertEquals("Reel C8W-8Jbxg8a", details.getTitle());
        assertEquals(reelUrl, details.getReelUrl());
        assertNotNull(details.getCaptionAnalysis());
        assertNotNull(details.getCtaAnalysis());
        assertNotNull(details.getRetentionPrediction());
        assertNotNull(details.getViralPotential());
    }
}
