package com.creatoros.api.service;

import com.creatoros.api.dto.GeneratedContent;
import com.creatoros.api.model.CreatorProfile;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class GeminiContentGenerationProvider implements ContentGenerationProvider {

    private static final Logger log = LoggerFactory.getLogger(GeminiContentGenerationProvider.class);
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String apiKey;

    public GeminiContentGenerationProvider(
            @Value("${gemini.api.key:}") String apiKey,
            ObjectMapper objectMapper) {
        this.apiKey = apiKey;
        this.objectMapper = objectMapper;

        // Configure connection timeouts (3s connect, 5s read)
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(3000);
        requestFactory.setReadTimeout(5000);

        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
                .baseUrl("https://generativelanguage.googleapis.com")
                .build();
    }

    @Override
    public GeneratedContent generateContent(CreatorProfile profile, String topic, String primaryGoal) {
        if (apiKey == null || apiKey.trim().isEmpty()) {
            throw new IllegalStateException("Gemini API key is not configured.");
        }

        String niche = (profile != null && profile.getNiche() != null) ? profile.getNiche() : "general content creation";
        String voice = (profile != null && profile.getBrandVoice() != null) ? profile.getBrandVoice() : "engaging and informative";
        String platform = (profile != null && profile.getPrimaryPlatform() != null) ? profile.getPrimaryPlatform() : "YouTube";

        String prompt = String.format(
                "You are an expert content strategist for creators. Generate a high-performing video content draft for:\n" +
                "Niche: %s\n" +
                "Brand Voice: %s\n" +
                "Primary Platform: %s\n" +
                "Topic: %s\n" +
                "Primary Goal: %s\n\n" +
                "The Primary Goal of the video must directly influence the hook, structure, CTAs, and overall content angle. For example:\n" +
                "- Reach: Use curiosity-driven hooks designed for viral potential.\n" +
                "- Engagement: Focus on initiating discussion or triggering comments.\n" +
                "- Lead Generation: Call out a specific pain point and suggest a lead magnet CTA.\n" +
                "- Sales: Handle objections and present a direct conversion CTA.\n" +
                "- Brand Awareness: Introduce core values, unique traits, and memorable branding.\n" +
                "- Community Building: Encourage collaboration, user-generated content, or direct audience call-outs.\n" +
                "- Authority Building: Use stats, credential-driven language, and actionable expertise.\n\n" +
                "Format your output strictly as a JSON object matching this structure (do not include any backticks or extra text outside the JSON):\n" +
                "{\n" +
                "  \"hooks\": [\"hook option 1\", \"hook option 2\", \"hook option 3\"],\n" +
                "  \"script\": \"Write a complete script divided into Part 1: Context Setup, Part 2: Core Strategy, and Part 3: The Iteration.\",\n" +
                "  \"ctas\": [\"CTA option 1\", \"CTA option 2\"]\n" +
                "}", niche, voice, platform, topic, primaryGoal != null ? primaryGoal : "General Engagement");

        Map<String, Object> requestBody = Map.of(
                "contents", List.of(
                        Map.of("parts", List.of(
                                Map.of("text", prompt)
                        ))
                ),
                "generationConfig", Map.of(
                        "responseMimeType", "application/json"
                )
        );

        try {
            log.info("Querying Gemini API for content generation on topic: {}", topic);
            String rawResponse = restClient.post()
                    .uri(uriBuilder -> uriBuilder
                            .path("/v1beta/models/gemini-1.5-flash:generateContent")
                            .queryParam("key", apiKey)
                            .build())
                    .body(requestBody)
                    .retrieve()
                    .body(String.class);

            JsonNode rootNode = objectMapper.readTree(rawResponse);
            String textResponse = rootNode
                    .path("candidates").get(0)
                    .path("content")
                    .path("parts").get(0)
                    .path("text").asText();

            JsonNode contentNode = objectMapper.readTree(textResponse.trim());

            List<String> hooks = new ArrayList<>();
            if (contentNode.has("hooks") && contentNode.get("hooks").isArray()) {
                contentNode.get("hooks").forEach(h -> hooks.add(h.asText()));
            }

            List<String> ctas = new ArrayList<>();
            if (contentNode.has("ctas") && contentNode.get("ctas").isArray()) {
                contentNode.get("ctas").forEach(c -> ctas.add(c.asText()));
            }

            String script = contentNode.path("script").asText("");

            return GeneratedContent.builder()
                    .hooks(hooks)
                    .script(script)
                    .ctas(ctas)
                    .build();

        } catch (Exception e) {
            log.error("Gemini content generation failed: {}", e.getMessage(), e);
            throw new RuntimeException("Gemini generation failed: " + e.getMessage(), e);
        }
    }
}
