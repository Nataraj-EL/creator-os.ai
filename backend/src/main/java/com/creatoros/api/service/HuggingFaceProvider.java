package com.creatoros.api.service;

import com.creatoros.api.config.AiRoutingConfig;
import com.creatoros.api.dto.ReelAnalysisInput;
import com.creatoros.api.dto.ReelAnalysisResult;
import com.creatoros.api.model.AiTaskType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

@Service
public class HuggingFaceProvider implements AiProvider {

    private static final Logger log = LoggerFactory.getLogger(HuggingFaceProvider.class);
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final AiRoutingConfig routingConfig;

    private final GeminiProvider geminiProvider;

    public HuggingFaceProvider(AiRoutingConfig routingConfig, ObjectMapper objectMapper, GeminiProvider geminiProvider) {
        this.routingConfig = routingConfig;
        this.objectMapper = objectMapper;
        this.geminiProvider = geminiProvider;

        // Configure connection timeouts: 10s connect, 30s read
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(10000);
        requestFactory.setReadTimeout(30000);

        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
                .baseUrl("https://router.huggingface.co/hf-inference")
                .defaultHeader(HttpHeaders.CONTENT_TYPE, "application/octet-stream")
                .build();
    }

    @Override
    public boolean supports(AiTaskType taskType) {
        return taskType == AiTaskType.REEL_ANALYSIS;
    }

    @Override
    public String getName() {
        return "huggingface";
    }

    @Override
    public <T, R> R execute(AiTaskType taskType, T input, Class<R> responseClass) {
        String apiKey = routingConfig.getHuggingFaceApiKey();
        if (apiKey == null || apiKey.trim().isEmpty()) {
            throw new IllegalStateException("Hugging Face API key is not configured.");
        }

        if (taskType != AiTaskType.REEL_ANALYSIS) {
            throw new IllegalArgumentException("Task type " + taskType + " is not supported by HuggingFaceProvider");
        }

        ReelAnalysisInput reelInput = (ReelAnalysisInput) input;

        try {
            log.info("[AI] Executing HuggingFaceProvider for {}", taskType);
            byte[] imgBytes = reelInput.getFileBytes();
            if (imgBytes == null || imgBytes.length == 0) {
                imgBytes = createDummyPng();
            }

            String rawResponse = restClient.post()
                    .uri("/models/Salesforce/blip-image-captioning")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .body(imgBytes)
                    .retrieve()
                    .body(String.class);

            JsonNode rootNode = objectMapper.readTree(rawResponse);
            String caption = "a preview of the video content";
            if (rootNode.isArray() && rootNode.size() > 0) {
                caption = rootNode.get(0).path("generated_text").asText("a preview of the video content");
            }

            log.info("[AI] Hugging Face captioning output: '{}'", caption);

            // Execute Gemini Reasoning based on the Hugging Face visual caption
            log.info("[AI] Delegating to Gemini reasoning with Hugging Face visual caption...");
            ReelAnalysisInput reasoningInput = reelInput.toBuilder()
                    .visualCaption(caption)
                    .build();

            return geminiProvider.execute(AiTaskType.REEL_ANALYSIS, reasoningInput, responseClass);

        } catch (Exception e) {
            log.error("[AI] Hugging Face + Gemini Reasoning flow failed: {}", e.getMessage());
            throw new RuntimeException("Hugging Face vision + Gemini reasoning flow failed: " + e.getMessage(), e);
        }
    }

    private byte[] createDummyPng() {
        // Valid 1x1 transparent PNG file bytes
        return new byte[]{
                (byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
                0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, (byte) 0xc4, (byte) 0x89, 0x00, 0x00, 0x00,
                0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, (byte) 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
                0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, (byte) 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
                0x45, 0x4e, 0x44, (byte) 0xae, 0x42, 0x60, (byte) 0x82
        };
    }
}
