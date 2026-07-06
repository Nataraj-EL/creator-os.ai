package com.creatoros.api;

import com.creatoros.api.dto.*;
import com.creatoros.api.model.AiTaskType;
import com.creatoros.api.model.User;
import com.creatoros.api.model.Workspace;
import com.creatoros.api.repository.UserRepository;
import com.creatoros.api.repository.WorkspaceRepository;
import com.creatoros.api.service.GeminiProvider;
import com.creatoros.api.service.GroqProvider;
import com.creatoros.api.service.MockProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
public class ContentRepurposeControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private WorkspaceRepository workspaceRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @SpyBean
    private GeminiProvider geminiProvider;

    @SpyBean
    private GroqProvider groqProvider;

    @SpyBean
    private MockProvider mockProvider;

    private User testUser;
    private Workspace testWorkspace;

    @BeforeEach
    void setUp() {
        Mockito.reset(geminiProvider, groqProvider, mockProvider);

        userRepository.deleteAll();
        workspaceRepository.deleteAll();

        testUser = User.builder()
                .email("test-creator@creatoros.ai")
                .password("hashed")
                .role(com.creatoros.api.model.Role.CREATOR)
                .build();
        userRepository.save(testUser);

        testWorkspace = Workspace.builder()
                .name("Default Workspace")
                .slug("default-workspace")
                .creator(testUser)
                .deleted(false)
                .build();
        workspaceRepository.save(testWorkspace);

        testUser.setActiveWorkspace(testWorkspace);
        userRepository.save(testUser);
    }

    @Test
    void testRepurposeUnauthenticatedReturns401() throws Exception {
        ContentRepurposeRequest request = ContentRepurposeRequest.builder()
                .originalContent("Repurpose this content")
                .sourceType(SourceType.SCRIPT)
                .targetFormat(TargetFormat.LINKEDIN_POST)
                .build();

        mockMvc.perform(post("/api/v1/workspaces/" + testWorkspace.getId() + "/repurpose")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void testRepurposeValidRequestReturns200WithContent() throws Exception {
        ContentRepurposeRequest request = ContentRepurposeRequest.builder()
                .originalContent("Repurpose this content")
                .sourceType(SourceType.SCRIPT)
                .targetFormat(TargetFormat.LINKEDIN_POST)
                .build();

        mockMvc.perform(post("/api/v1/workspaces/" + testWorkspace.getId() + "/repurpose")
                        .with(user(testUser))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").exists())
                .andExpect(jsonPath("$.content").exists())
                .andExpect(jsonPath("$.suggestedHashtags").isArray())
                .andExpect(jsonPath("$.suggestedCTA").exists());
    }

    @Test
    void testRepurposeInvalidValidationRequestReturns400() throws Exception {
        ContentRepurposeRequest request = ContentRepurposeRequest.builder()
                .originalContent("")
                .sourceType(SourceType.SCRIPT)
                .targetFormat(TargetFormat.LINKEDIN_POST)
                .build();

        mockMvc.perform(post("/api/v1/workspaces/" + testWorkspace.getId() + "/repurpose")
                        .with(user(testUser))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.originalContent").value("Original content is required"));
    }

    @Test
    void testRepurposeInvalidWorkspaceReturns400() throws Exception {
        ContentRepurposeRequest request = ContentRepurposeRequest.builder()
                .originalContent("Repurpose this content")
                .sourceType(SourceType.SCRIPT)
                .targetFormat(TargetFormat.LINKEDIN_POST)
                .build();

        UUID badWorkspaceId = UUID.randomUUID();

        mockMvc.perform(post("/api/v1/workspaces/" + badWorkspaceId + "/repurpose")
                        .with(user(testUser))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Workspace not found or unauthorized"));
    }

    @Test
    void testRepurposeFallbackChain() throws Exception {
        ContentRepurposeRequest request = ContentRepurposeRequest.builder()
                .originalContent("Fallback test content")
                .sourceType(SourceType.SCRIPT)
                .targetFormat(TargetFormat.LINKEDIN_POST)
                .build();

        doThrow(new RuntimeException("Gemini failed")).when(geminiProvider)
                .execute(eq(AiTaskType.CONTENT_REPURPOSE), any(), eq(ContentRepurposeResult.class));
        doThrow(new RuntimeException("Groq failed")).when(groqProvider)
                .execute(eq(AiTaskType.CONTENT_REPURPOSE), any(), eq(ContentRepurposeResult.class));

        mockMvc.perform(post("/api/v1/workspaces/" + testWorkspace.getId() + "/repurpose")
                        .with(user(testUser))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").exists())
                .andExpect(jsonPath("$.content").exists());

        verify(geminiProvider).execute(eq(AiTaskType.CONTENT_REPURPOSE), any(), eq(ContentRepurposeResult.class));
        verify(groqProvider).execute(eq(AiTaskType.CONTENT_REPURPOSE), any(), eq(ContentRepurposeResult.class));
        verify(mockProvider).execute(eq(AiTaskType.CONTENT_REPURPOSE), any(), eq(ContentRepurposeResult.class));
    }
}
