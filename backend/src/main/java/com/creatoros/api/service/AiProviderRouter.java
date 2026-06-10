package com.creatoros.api.service;

import com.creatoros.api.config.AiRoutingConfig;
import com.creatoros.api.model.AiTaskType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class AiProviderRouter {

    private static final Logger log = LoggerFactory.getLogger(AiProviderRouter.class);

    private final List<AiProvider> providers;
    private final AiRoutingConfig routingConfig;

    public AiProviderRouter(List<AiProvider> providers, AiRoutingConfig routingConfig) {
        this.providers = providers;
        this.routingConfig = routingConfig;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void checkAIProviderHealth() {
        log.info("=== CreatorOS AI Provider Health Check ===");

        boolean geminiHasKey = routingConfig.getGeminiApiKey() != null && !routingConfig.getGeminiApiKey().trim().isEmpty();
        if (geminiHasKey) {
            log.info("[AI] Gemini Available");
        } else {
            log.warn("[AI] Provider unavailable, fallback enabled");
        }

        boolean groqHasKey = routingConfig.getGroqApiKey() != null && !routingConfig.getGroqApiKey().trim().isEmpty();
        if (groqHasKey) {
            log.info("[AI] Groq Available");
        } else {
            log.warn("[AI] Provider unavailable, fallback enabled");
        }

        boolean cohereHasKey = routingConfig.getCohereApiKey() != null && !routingConfig.getCohereApiKey().trim().isEmpty();
        if (cohereHasKey) {
            log.info("[AI] Cohere Available");
        } else {
            log.warn("[AI] Provider unavailable, fallback enabled");
        }

        boolean hfHasKey = routingConfig.getHuggingFaceApiKey() != null && !routingConfig.getHuggingFaceApiKey().trim().isEmpty();
        if (hfHasKey) {
            log.info("[AI] HuggingFace Available");
        } else {
            log.warn("[AI] Provider unavailable, fallback enabled");
        }

        log.info("==========================================");
    }

    private AiProvider getProviderByName(String name) {
        return providers.stream()
                .filter(p -> p.getName().equalsIgnoreCase(name))
                .findFirst()
                .orElse(null);
    }

    public <T, R> R executeWithFallback(AiTaskType taskType, T input, Class<R> responseClass) {
        List<String> chain = new ArrayList<>();

        if (taskType == AiTaskType.GROWTH_AUDIT) {
            String primary = routingConfig.getGrowthAuditProvider();
            chain.add(primary);
            if (!primary.equalsIgnoreCase("gemini")) chain.add("gemini");
            if (!primary.equalsIgnoreCase("groq")) chain.add("groq");
            chain.add("mock");
        } else if (taskType == AiTaskType.GROWTH_ADVISOR) {
            String primary = routingConfig.getGrowthAdvisorProvider();
            chain.add(primary);
            if (!primary.equalsIgnoreCase("gemini")) chain.add("gemini");
            if (!primary.equalsIgnoreCase("groq")) chain.add("groq");
            chain.add("mock");
        } else if (taskType == AiTaskType.CONTENT_GENERATION) {
            String primary = routingConfig.getContentStudioProvider();
            chain.add(primary);
            if (!primary.equalsIgnoreCase("groq")) chain.add("groq");
            if (!primary.equalsIgnoreCase("gemini")) chain.add("gemini");
            chain.add("mock");
        } else if (taskType == AiTaskType.REEL_ANALYSIS) {
            String primary = routingConfig.getReelAnalyzerProvider();
            if (primary != null && primary.equalsIgnoreCase("mock")) {
                chain.add("mock");
            } else {
                chain.add("gemini");
                chain.add("groq");
                chain.add("mock");
            }
        } else if (taskType == AiTaskType.KNOWLEDGE_SEARCH) {
            String primary = routingConfig.getKnowledgeBrainProvider();
            chain.add(primary);
            if (!primary.equalsIgnoreCase("cohere")) chain.add("cohere");
            chain.add("mock");
        } else if (taskType == AiTaskType.BRAIN_ANALYSIS) {
            chain.add("gemini");
            chain.add("groq");
            chain.add("mock");
        }

        for (String providerName : chain) {
            AiProvider provider = getProviderByName(providerName);
            if (provider != null && provider.supports(taskType)) {
                try {
                    return provider.execute(taskType, input, responseClass);
                } catch (Exception e) {
                    log.warn("[AI] Provider '{}' failed for task '{}'. Error: {}. Trying next fallback...",
                            providerName, taskType, e.getMessage());
                }
            }
        }

        throw new RuntimeException("All AI providers in fallback chain failed for task: " + taskType);
    }
}
