package com.creatoros.api;

import com.creatoros.api.config.AiRoutingConfig;
import com.creatoros.api.dto.*;
import com.creatoros.api.model.AiTaskType;
import com.creatoros.api.model.KnowledgeDocument;
import com.creatoros.api.model.KnowledgeStatus;
import com.creatoros.api.model.User;
import com.creatoros.api.model.Workspace;
import com.creatoros.api.repository.KnowledgeDocumentRepository;
import com.creatoros.api.repository.WorkspaceRepository;
import com.creatoros.api.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.context.ActiveProfiles;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@SpringBootTest
@ActiveProfiles("test")
public class AiProviderRoutingTests {

    @Autowired
    private AiProviderRouter aiProviderRouter;

    @Autowired
    private KnowledgeDocumentService knowledgeDocumentService;

    @MockBean
    private WorkspaceRepository workspaceRepository;

    @MockBean
    private KnowledgeDocumentRepository knowledgeDocumentRepository;

    @SpyBean
    private GeminiProvider geminiProvider;

    @SpyBean
    private GroqProvider groqProvider;

    @SpyBean
    private HuggingFaceProvider huggingFaceProvider;

    @SpyBean
    private CohereProvider cohereProvider;

    @SpyBean
    private MockProvider mockProvider;

    @BeforeEach
    void resetSpies() {
        Mockito.reset(geminiProvider, groqProvider, huggingFaceProvider, cohereProvider, mockProvider);
    }

    @Test
    void testGrowthAuditDefaultRoutingAndFallback() {
        GrowthAuditInput input = GrowthAuditInput.builder()
                .creatorName("Test Creator")
                .niche("Tech")
                .platform("YouTube")
                .subscribers(1000)
                .views(50000)
                .ctr(5.5)
                .weeklyUploads(2)
                .avdSeconds(120)
                .brandVoice("Funny")
                .build();

        // 1. Stub Gemini to fail to test fallback to Groq
        doThrow(new RuntimeException("Gemini failed")).when(geminiProvider)
                .execute(eq(AiTaskType.GROWTH_AUDIT), any(), eq(GrowthAuditResult.class));

        // 2. Stub Groq to succeed
        GrowthAuditResult mockGroqResult = GrowthAuditResult.builder()
                .growthScore(75)
                .summary("Groq Audit Success")
                .strengths(List.of())
                .weaknesses(List.of())
                .recommendations(List.of())
                .build();
        doReturn(mockGroqResult).when(groqProvider)
                .execute(eq(AiTaskType.GROWTH_AUDIT), any(), eq(GrowthAuditResult.class));

        GrowthAuditResult result = aiProviderRouter.executeWithFallback(AiTaskType.GROWTH_AUDIT, input, GrowthAuditResult.class);

        assertNotNull(result);
        assertEquals("Groq Audit Success", result.getSummary());

        // Verify order: Gemini tried first, then Groq
        InOrder inOrder = inOrder(geminiProvider, groqProvider);
        inOrder.verify(geminiProvider).execute(eq(AiTaskType.GROWTH_AUDIT), any(), eq(GrowthAuditResult.class));
        inOrder.verify(groqProvider).execute(eq(AiTaskType.GROWTH_AUDIT), any(), eq(GrowthAuditResult.class));
    }

    @Test
    void testGrowthAuditFallbackToMock() {
        GrowthAuditInput input = GrowthAuditInput.builder()
                .creatorName("Test Creator")
                .niche("Tech")
                .platform("YouTube")
                .build();

        // Stub Gemini and Groq to fail
        doThrow(new RuntimeException("Gemini failed")).when(geminiProvider)
                .execute(eq(AiTaskType.GROWTH_AUDIT), any(), eq(GrowthAuditResult.class));
        doThrow(new RuntimeException("Groq failed")).when(groqProvider)
                .execute(eq(AiTaskType.GROWTH_AUDIT), any(), eq(GrowthAuditResult.class));

        GrowthAuditResult result = aiProviderRouter.executeWithFallback(AiTaskType.GROWTH_AUDIT, input, GrowthAuditResult.class);

        assertNotNull(result);
        assertTrue(result.getSummary().contains("Mock Fallback"));

        // Verify fallback chain executed fully to Mock
        verify(geminiProvider).execute(eq(AiTaskType.GROWTH_AUDIT), any(), eq(GrowthAuditResult.class));
        verify(groqProvider).execute(eq(AiTaskType.GROWTH_AUDIT), any(), eq(GrowthAuditResult.class));
        verify(mockProvider).execute(eq(AiTaskType.GROWTH_AUDIT), any(), eq(GrowthAuditResult.class));
    }

    @Test
    void testContentStudioDefaultRoutingAndFallback() {
        ContentGenerationInput input = ContentGenerationInput.builder()
                .niche("Cooking")
                .platform("TikTok")
                .voice("Friendly")
                .topic("Pasta Recipes")
                .build();

        // Stub Groq to fail
        doThrow(new RuntimeException("Groq failed")).when(groqProvider)
                .execute(eq(AiTaskType.CONTENT_GENERATION), any(), eq(GeneratedContent.class));

        // Stub Gemini to succeed
        GeneratedContent mockGeminiResult = GeneratedContent.builder()
                .hooks(List.of("Gemini Hook"))
                .script("Gemini Script")
                .ctas(List.of("Gemini CTA"))
                .build();
        doReturn(mockGeminiResult).when(geminiProvider)
                .execute(eq(AiTaskType.CONTENT_GENERATION), any(), eq(GeneratedContent.class));

        GeneratedContent result = aiProviderRouter.executeWithFallback(AiTaskType.CONTENT_GENERATION, input, GeneratedContent.class);

        assertNotNull(result);
        assertEquals("Gemini Script", result.getScript());

        InOrder inOrder = inOrder(groqProvider, geminiProvider);
        inOrder.verify(groqProvider).execute(eq(AiTaskType.CONTENT_GENERATION), any(), eq(GeneratedContent.class));
        inOrder.verify(geminiProvider).execute(eq(AiTaskType.CONTENT_GENERATION), any(), eq(GeneratedContent.class));
    }

    @Test
    void testReelAnalyzerVisionAndReasoningRouting() {
        ReelAnalysisInput input = ReelAnalysisInput.builder()
                .fileName("reel.mp4")
                .fileSize(5000000L)
                .build();

        // Stub Gemini to succeed
        ReelAnalysisResult mockResult = ReelAnalysisResult.builder()
                .overallScore(88)
                .durationSeconds(15)
                .strengths(List.of("Visual frame has Gemini vision input"))
                .weaknesses(List.of())
                .recommendations(List.of())
                .build();

        doReturn(mockResult).when(geminiProvider)
                .execute(eq(AiTaskType.REEL_ANALYSIS), any(), eq(ReelAnalysisResult.class));

        ReelAnalysisResult result = aiProviderRouter.executeWithFallback(AiTaskType.REEL_ANALYSIS, input, ReelAnalysisResult.class);

        assertNotNull(result);
        assertEquals(88, result.getOverallScore());
        verify(geminiProvider).execute(eq(AiTaskType.REEL_ANALYSIS), any(), eq(ReelAnalysisResult.class));
    }

    @Test
    void testKnowledgeSearchKeywordRetrievalFilter() {
        User creator = User.builder().id(UUID.randomUUID()).email("test@creatoros.com").build();
        UUID workspaceId = UUID.randomUUID();
        Workspace workspace = Workspace.builder().id(workspaceId).creator(creator).build();

        KnowledgeDocument doc1 = KnowledgeDocument.builder()
                .id(UUID.randomUUID())
                .workspace(workspace)
                .fileName("growth_strategies.txt")
                .extractedText("This text is about how to grow your audience using short form videos.")
                .status(KnowledgeStatus.READY)
                .deleted(false)
                .build();

        KnowledgeDocument doc2 = KnowledgeDocument.builder()
                .id(UUID.randomUUID())
                .workspace(workspace)
                .fileName("cooking_recipes.txt")
                .extractedText("Best chocolate chip cookies recipes and secrets.")
                .status(KnowledgeStatus.READY)
                .deleted(false)
                .build();

        // Mock database repository responses
        when(workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId()))
                .thenReturn(Optional.of(workspace));
        when(knowledgeDocumentRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId))
                .thenReturn(List.of(doc1, doc2));

        // Stub Cohere to return a score
        KnowledgeSearchResult mockSearchResult = KnowledgeSearchResult.builder()
                .matches(List.of(KnowledgeSearchResult.Match.builder()
                        .documentId(doc1.getId())
                        .fileName(doc1.getFileName())
                        .excerpt("This text is about how to grow...")
                        .relevanceScore(0.95)
                        .build()))
                .build();
        doReturn(mockSearchResult).when(cohereProvider)
                .execute(eq(AiTaskType.KNOWLEDGE_SEARCH), any(), eq(KnowledgeSearchResult.class));

        // Perform search with query "grow"
        List<KnowledgeSearchResult.Match> matches = knowledgeDocumentService.searchKnowledge(creator, workspaceId, "grow");

        assertNotNull(matches);
        assertEquals(1, matches.size());
        assertEquals(doc1.getId(), matches.get(0).getDocumentId());

        // Verify that the cohere search input only received doc1 as candidate (due to keyword filtering)
        verify(cohereProvider).execute(eq(AiTaskType.KNOWLEDGE_SEARCH), argThat((KnowledgeSearchInput in) -> {
            assertEquals(1, in.getCandidates().size());
            assertEquals(doc1.getId(), in.getCandidates().get(0).getDocumentId());
            return true;
        }), eq(KnowledgeSearchResult.class));
    }
}
