package com.creatoros.api.service;

import com.creatoros.api.config.AiRoutingConfig;
import com.creatoros.api.dto.KnowledgeSearchInput;
import com.creatoros.api.dto.KnowledgeSearchResult;
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
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class CohereProvider implements AiProvider {

    private static final Logger log = LoggerFactory.getLogger(CohereProvider.class);
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final AiRoutingConfig routingConfig;

    public CohereProvider(AiRoutingConfig routingConfig, ObjectMapper objectMapper) {
        this.routingConfig = routingConfig;
        this.objectMapper = objectMapper;

        // Configure connection timeouts: 10s connect, 30s read
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(10000);
        requestFactory.setReadTimeout(30000);

        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
                .baseUrl("https://api.cohere.com")
                .defaultHeader(HttpHeaders.CONTENT_TYPE, "application/json")
                .build();
    }

    @Override
    public boolean supports(AiTaskType taskType) {
        return taskType == AiTaskType.KNOWLEDGE_SEARCH;
    }

    @Override
    public String getName() {
        return "cohere";
    }

    @Override
    public <T, R> R execute(AiTaskType taskType, T input, Class<R> responseClass) {
        String apiKey = routingConfig.getCohereApiKey();
        if (apiKey == null || apiKey.trim().isEmpty()) {
            throw new IllegalStateException("Cohere API key is not configured.");
        }

        if (taskType != AiTaskType.KNOWLEDGE_SEARCH) {
            throw new IllegalArgumentException("Task type " + taskType + " is not supported by CohereProvider");
        }

        KnowledgeSearchInput searchInput = (KnowledgeSearchInput) input;
        List<KnowledgeSearchInput.DocumentCandidate> candidates = searchInput.getCandidates();

        if (candidates == null || candidates.isEmpty()) {
            return responseClass.cast(KnowledgeSearchResult.builder().matches(List.of()).build());
        }

        // Limit the documents list content length to prevent hitting API limits
        List<String> docTexts = candidates.stream()
                .map(c -> {
                    String content = c.getContent() != null ? c.getContent() : "";
                    return content.length() > 4000 ? content.substring(0, 4000) : content;
                })
                .collect(Collectors.toList());

        Map<String, Object> requestBody = Map.of(
                "model", "rerank-v3.5",
                "query", searchInput.getQuery(),
                "documents", docTexts
        );

        try {
            log.info("[AI] Executing CohereProvider for {}", taskType);

            String rawResponse = restClient.post()
                    .uri("/v1/rerank")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .body(requestBody)
                    .retrieve()
                    .body(String.class);

            JsonNode rootNode = objectMapper.readTree(rawResponse);
            JsonNode resultsNode = rootNode.path("results");

            List<KnowledgeSearchResult.Match> matches = new ArrayList<>();
            if (resultsNode.isArray()) {
                for (JsonNode result : resultsNode) {
                    int index = result.path("index").asInt();
                    double relevanceScore = result.path("relevance_score").asDouble();

                    if (index >= 0 && index < candidates.size()) {
                        KnowledgeSearchInput.DocumentCandidate cand = candidates.get(index);
                        String content = cand.getContent() != null ? cand.getContent() : "";
                        String excerpt = content.length() > 180 ? content.substring(0, 180) + "..." : content;

                        matches.add(KnowledgeSearchResult.Match.builder()
                                .documentId(cand.getDocumentId())
                                .fileName(cand.getFileName())
                                .excerpt(excerpt)
                                .relevanceScore(relevanceScore)
                                .build());
                    }
                }
            }

            // Sort by relevance score in descending order
            matches.sort(Comparator.comparingDouble(KnowledgeSearchResult.Match::getRelevanceScore).reversed());

            KnowledgeSearchResult searchResult = KnowledgeSearchResult.builder()
                    .matches(matches)
                    .build();

            return responseClass.cast(searchResult);

        } catch (Exception e) {
            log.error("[AI] Cohere execution failed: {}", e.getMessage());
            throw new RuntimeException("Cohere execution failed: " + e.getMessage(), e);
        }
    }
}
