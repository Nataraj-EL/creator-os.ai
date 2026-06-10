package com.creatoros.api.config;

import lombok.Data;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
@Data
public class AiRoutingConfig {

    @Value("${ai.routing.growth-audit:gemini}")
    private String growthAuditProvider;

    @Value("${ai.routing.growth-advisor:gemini}")
    private String growthAdvisorProvider;

    @Value("${ai.routing.content-studio:groq}")
    private String contentStudioProvider;

    @Value("${ai.routing.reel-analyzer:huggingface}")
    private String reelAnalyzerProvider;

    @Value("${ai.routing.knowledge-brain:cohere}")
    private String knowledgeBrainProvider;

    @Value("${gemini.api-key:}")
    private String geminiApiKey;

    @Value("${groq.api-key:}")
    private String groqApiKey;

    @Value("${huggingface.api-key:}")
    private String huggingFaceApiKey;

    @Value("${cohere.api-key:}")
    private String cohereApiKey;
}
