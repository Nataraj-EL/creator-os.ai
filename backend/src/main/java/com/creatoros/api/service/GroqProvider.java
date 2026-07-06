package com.creatoros.api.service;

import com.creatoros.api.config.AiRoutingConfig;
import com.creatoros.api.dto.*;
import com.creatoros.api.model.AiTaskType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Service
public class GroqProvider implements AiProvider {

    private static final Logger log = LoggerFactory.getLogger(GroqProvider.class);
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final AiRoutingConfig routingConfig;

    public GroqProvider(AiRoutingConfig routingConfig, ObjectMapper objectMapper) {
        this.routingConfig = routingConfig;
        this.objectMapper = objectMapper;

        // Configure connection timeouts: 10s connect, 30s read
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(10000);
        requestFactory.setReadTimeout(30000);

        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
                .baseUrl("https://api.groq.com")
                .defaultHeader(HttpHeaders.CONTENT_TYPE, "application/json")
                .build();
    }

    @Override
    public boolean supports(AiTaskType taskType) {
        return taskType == AiTaskType.CONTENT_GENERATION 
                || taskType == AiTaskType.GROWTH_AUDIT 
                || taskType == AiTaskType.REEL_ANALYSIS
                || taskType == AiTaskType.GROWTH_ADVISOR
                || taskType == AiTaskType.BRAIN_ANALYSIS
                || taskType == AiTaskType.CONTENT_REPURPOSE;
    }

    @Override
    public String getName() {
        return "groq";
    }

    @Override
    public <T, R> R execute(AiTaskType taskType, T input, Class<R> responseClass) {
        String apiKey = routingConfig.getGroqApiKey();
        if (apiKey == null || apiKey.trim().isEmpty()) {
            throw new IllegalStateException("Groq API key is not configured.");
        }

        String prompt;
        if (taskType == AiTaskType.CONTENT_GENERATION) {
            ContentGenerationInput genInput = (ContentGenerationInput) input;
            String personalContext = "";
            if (genInput.getCreatorIdentity() != null && !genInput.getCreatorIdentity().trim().isEmpty()) {
                personalContext = String.format(
                        "\n--- PERSONALIZATION CONTEXT (CREATOR BRAIN TWIN) ---\n" +
                        "Creator Identity: %s\n" +
                        "Audience Profile: %s\n" +
                        "Communication Style: %s\n" +
                        "Writing Style: %s\n" +
                        "Preferred CTA Style: %s\n" +
                        "Creator DNA: %s\n" +
                        "Signature Writing Examples:\n%s\n" +
                        "--------------------------------------------------\n" +
                        "CRITICAL: You MUST write the script hooks, body, and CTAs to strictly match this creator identity, communication style, writing style, DNA, and formatting parameters. Ensure the tone is cohesive with the signature content examples provided.\n",
                        genInput.getCreatorIdentity(),
                        genInput.getAudienceProfile(),
                        genInput.getCommunicationStyle(),
                        genInput.getWritingStyle(),
                        genInput.getPreferredCTAStyle(),
                        genInput.getCreatorDNA(),
                        genInput.getContentExamples()
                );
            }
            prompt = String.format(
                    "You are an expert content strategist for creators. Generate a high-performing video content draft for:\n" +
                    "Niche: %s\n" +
                    "Brand Voice: %s\n" +
                    "Primary Platform: %s\n" +
                    "Topic: %s\n" +
                    "Primary Goal: %s\n%s\n" +
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
                    "}",
                    genInput.getNiche(), genInput.getVoice(), genInput.getPlatform(), genInput.getTopic(),
                    genInput.getPrimaryGoal() != null ? genInput.getPrimaryGoal() : "General Engagement",
                    personalContext
            );
        } else if (taskType == AiTaskType.GROWTH_AUDIT) {
            GrowthAuditInput auditInput = (GrowthAuditInput) input;
            prompt = String.format(
                    "You are an expert growth strategist for content creators. Conduct a thorough growth audit for the following creator profile and metrics:\n" +
                    "Creator Name: %s\n" +
                    "Niche: %s\n" +
                    "Primary Platform: %s\n" +
                    "Subscribers: %d\n" +
                    "Views: %d\n" +
                    "CTR: %.2f%%\n" +
                    "Weekly Uploads: %d\n" +
                    "Average View Duration (seconds): %d\n" +
                    "Brand Voice: %s\n\n" +
                    "Format your output strictly as a JSON object matching this structure (do not include any backticks or extra text outside the JSON):\n" +
                    "{\n" +
                    "  \"growthScore\": 82,\n" +
                    "  \"contentScore\": 75,\n" +
                    "  \"engagementScore\": 85,\n" +
                    "  \"consistencyScore\": 90,\n" +
                    "  \"audienceScore\": 78,\n" +
                    "  \"summary\": \"Detailed narrative summary of performance...\",\n" +
                    "  \"strengths\": [\"Strength 1\", \"Strength 2\"],\n" +
                    "  \"weaknesses\": [\"Weakness 1\", \"Weakness 2\"],\n" +
                    "  \"recommendations\": [\n" +
                    "    {\n" +
                    "      \"title\": \"Actionable recommendation 1\",\n" +
                    "      \"description\": \"Detailed steps to execute...\",\n" +
                    "      \"impact\": \"HIGH\",\n" +
                    "      \"category\": \"CONTENT\"\n" +
                    "    }\n" +
                    "  ]\n" +
                    "}",
                    auditInput.getCreatorName(), auditInput.getNiche(), auditInput.getPlatform(),
                    auditInput.getSubscribers(), auditInput.getViews(), auditInput.getCtr(),
                    auditInput.getWeeklyUploads(), auditInput.getAvdSeconds(), auditInput.getBrandVoice()
            );
        } else if (taskType == AiTaskType.REEL_ANALYSIS) {
            ReelAnalysisInput reelInput = (ReelAnalysisInput) input;
            String instagramCaption = "";
            if (reelInput.getCaption() != null && !reelInput.getCaption().trim().isEmpty()) {
                instagramCaption = String.format("Instagram Post Caption: \"%s\"\n", reelInput.getCaption());
            }
            String personalContext = "";
            if (reelInput.getCreatorIdentity() != null && !reelInput.getCreatorIdentity().trim().isEmpty()) {
                personalContext = String.format(
                        "\n--- CREATOR BRAIN TWIN DNA ---\n" +
                        "Creator Identity: %s\n" +
                        "Creator DNA: %s\n" +
                        "------------------------------\n" +
                        "CRITICAL: When analyzing visual frame elements, caption copy, and CTAs, you MUST explicitly evaluate them against the creator's target identity and DNA. Identify voice alignment strengths and key positioning mismatches in your diagnostic write-ups.\n",
                        reelInput.getCreatorIdentity(), reelInput.getCreatorDNA()
                );
            }
            prompt = String.format(
                    "You are an expert reel and short-form video analyst. Analyze the following uploaded reel/video metadata:\n" +
                    "File Name: %s\n" +
                    "File Size: %d bytes\n" +
                    "Reel URL: %s\n" +
                    "%s\n%s\n" +
                    "Generate a comprehensive diagnostic reel analysis report based on this metadata and caption (if available).\n" +
                    "Format your output strictly as a JSON object matching this structure (do not include any backticks or extra text outside the JSON):\n" +
                    "{\n" +
                    "  \"durationSeconds\": 30,\n" +
                    "  \"hookScore\": 70,\n" +
                    "  \"retentionScore\": 80,\n" +
                    "  \"ctaScore\": 75,\n" +
                    "  \"contentScore\": 85,\n" +
                    "  \"overallScore\": 77,\n" +
                    "  \"strengths\": [\"Strength 1\", \"Strength 2\"],\n" +
                    "  \"weaknesses\": [\"Weakness 1\"],\n" +
                    "  \"recommendations\": [\"Recommendation 1\", \"Recommendation 2\"],\n" +
                    "  \"hookAnalysis\": \"Detailed analysis of the video hook, visual momentum, and immediate attention retention (first 3 seconds)\",\n" +
                    "  \"captionAnalysis\": \"Detailed analysis of the post caption, readability, copywriting, and search indexability\",\n" +
                    "  \"ctaAnalysis\": \"Analysis of the call to action, end-screen overlays, and conversion logic\",\n" +
                    "  \"retentionPrediction\": \"Evaluation of the audience retention drops, pacing transitions, and watch time opportunities\",\n" +
                    "  \"viralPotential\": \"Prediction of virality potential, estimated reach index, and key editing/visual optimizations\"\n" +
                    "}",
                    reelInput.getFileName() != null ? reelInput.getFileName() : "Instagram Reel",
                    reelInput.getFileSize(),
                    reelInput.getReelUrl() != null ? reelInput.getReelUrl() : "N/A",
                    instagramCaption,
                    personalContext
            );
        } else if (taskType == AiTaskType.GROWTH_ADVISOR) {
            GrowthAdvisorInput advisorInput = (GrowthAdvisorInput) input;
            ChannelMetadata meta = advisorInput.getMetadata();
            String metaString = String.format(
                    "Handle: %s\n" +
                    "Title: %s\n" +
                    "Description/Bio: %s\n" +
                    "Subscribers/Followers: %s\n" +
                    "Video Count: %s\n" +
                    "Analysis Mode: %s\n",
                    meta.getHandle(),
                    meta.getTitle() != null ? meta.getTitle() : "N/A",
                    meta.getDescription() != null ? meta.getDescription() : "N/A",
                    meta.getPlatform().equalsIgnoreCase("youtube") 
                        ? (meta.getSubscriberCount() != null ? String.valueOf(meta.getSubscriberCount()) : "N/A") 
                        : (meta.getFollowers() != null ? String.valueOf(meta.getFollowers()) : "N/A"),
                    meta.getVideoCount() != null ? String.valueOf(meta.getVideoCount()) : "N/A",
                    meta.getAnalysisMode()
            );

            String nicheStr = (advisorInput.getNiche() != null && !advisorInput.getNiche().trim().isEmpty())
                    ? String.format("Suggested Creator Niche: %s\n", advisorInput.getNiche())
                    : "";

            String instructions = "";
            if ("PROFILE_ONLY".equals(meta.getAnalysisMode())) {
                instructions = String.format(
                        "CRITICAL: Since the analysisMode is PROFILE_ONLY, you MUST start your response's 'profileSummary' field EXACTLY with this sentence: " +
                        "\"I could identify this as a %s profile, but detailed analytics are unavailable from public sources. Recommendations are based on channel positioning, branding, content strategy, and niche best practices.\" " +
                        "After this sentence, you MUST proceed with analyzing the channel positioning and branding. If the handle or title corresponds to a well-known creator (such as MrBeast, Ali Abdaal, Marques Brownlee / MKBHD, etc.), leverage your pre-trained knowledge about their specific content format, production style, target demographic, and growth stage to generate a highly tailored, custom strategy. Avoid generic, boilerplate advice at all costs.",
                        meta.getPlatform().equalsIgnoreCase("youtube") ? "YouTube channel" : "Instagram"
                );
            } else {
                instructions = "Analyze the channel positioning, strengths, weaknesses, opportunities, and content gaps using the provided public metadata. If the creator is well-known, combine the public metadata with your pre-trained knowledge to deliver highly specific and custom growth recommendations.";
            }

            String personalContext = "";
            if (advisorInput.getCreatorIdentity() != null && !advisorInput.getCreatorIdentity().trim().isEmpty()) {
                personalContext = String.format(
                        "\n--- CREATOR BRAIN TWIN GOALS & STRATEGY ---\n" +
                        "Creator Identity: %s\n" +
                        "Audience Profile: %s\n" +
                        "Content Pillars: %s\n" +
                        "Strategic Focus: %s\n" +
                        "Long-Term Goals: %s\n" +
                        "-------------------------------------------\n" +
                        "CRITICAL: You MUST tailor all recommendations, strengths/weaknesses audits, audience opportunities, and the 30-day week-by-week roadmap to align with and accelerate these specific strategic goals, focus, and content pillars.\n",
                        advisorInput.getCreatorIdentity(),
                        advisorInput.getAudienceProfile(),
                        advisorInput.getContentPillars(),
                        advisorInput.getStrategicFocus(),
                        advisorInput.getLongTermGoals()
                );
            }

            prompt = String.format(
                    "You are an expert creator growth advisor and channel strategist. Perform a detailed profile analysis for:\n" +
                    "Platform: %s\n" +
                    "Profile URL: %s\n" +
                    "%s\n" +
                    "Profile Metadata:\n" +
                    "%s\n" +
                    "%s\n%s\n\n" +
                    "INSTRUCTIONS FOR PERSONALIZATION:\n" +
                    "Your analysis and recommendations MUST be deeply customized and specific to this creator. You must explicitly analyze:\n" +
                    "- Creator Niche: the exact sub-niche, topics, and level of technicality/entertainment.\n" +
                    "- Content Format: the video length, style (talking head, documentary, sketch, high-production, etc.), and production quality.\n" +
                    "- Audience Type: target demographic, intent (educational, casual entertainment, professional skill-building), and active community presence.\n" +
                    "- Posting Strategy: cadence patterns, topic consistency vs variety.\n" +
                    "- Monetization Style: sponsorships, product placements, digital products, coaching, merchandise, or passive AdSense.\n" +
                    "- Positioning & Unique Angle: how they stand out from competitors.\n" +
                    "- Competitive Advantages: what unique assets (studio gear, team, proprietary data, storytelling skill) they leverage.\n\n" +
                    "CRITICAL QUALITY RULES:\n" +
                    "1. AVOID GENERIC OBSERVATIONS or boilerplate growth tips (do NOT recommend generic advice like 'make clickable thumbnails', 'post consistently', 'use good lighting', or 'add captions'). Every point must be specific and actionable only for this particular creator's content.\n" +
                    "2. If metadata or profile details are limited, do not make up fake metrics or invent facts. Instead, state your logical assumptions clearly in the summary (e.g., 'Assuming this channel primarily targets enterprise developers based on its title...').\n" +
                    "3. If this is a famous creator (such as MrBeast, Ali Abdaal, Marques Brownlee / MKBHD, PewDiePie, etc.), leverage your pre-trained knowledge about their exact style, team size, content legacy, and business operations to provide a tailored, highly professional audit.\n\n" +
                    "Format your output strictly as a JSON object matching this structure (do not include any backticks or extra text outside the JSON):\n" +
                    "{\n" +
                    "  \"profileSummary\": \"Positioning, unique angle, and niche analysis (explicitly mentioning your assumptions if data is limited)...\",\n" +
                    "  \"strengths\": [\"Specific Strength 1\", \"Specific Strength 2\"],\n" +
                    "  \"weaknesses\": [\"Specific Weakness 1\", \"Specific Weakness 2\"],\n" +
                    "  \"opportunities\": [\"Specific Audience/Business opportunity 1\", \"Specific Audience/Business opportunity 2\"],\n" +
                    "  \"contentGaps\": [\"Specific Content gap 1\", \"Specific Content gap 2\"],\n" +
                    "  \"recommendations\": [\"Specific Recommendation 1\", \"Specific Recommendation 2\"],\n" +
                    "  \"growthRoadmap\": \"Detailed 30-day week-by-week roadmap tailored only to this creator's workflow and content themes\"\n" +
                    "}",
                    meta.getPlatform(),
                    advisorInput.getProfileUrl(),
                    nicheStr,
                    metaString,
                    instructions,
                    personalContext
            );
        } else if (taskType == AiTaskType.BRAIN_ANALYSIS) {
            BrainAnalysisInput brainInput = (BrainAnalysisInput) input;
            prompt = String.format(
                    "You are an expert creator intelligence compiler. You are provided with the text corpus extracted from the creator's uploaded knowledge base documents:\n\n" +
                    "--- BEGIN TEXT CORPUS ---\n" +
                    "%s\n" +
                    "--- END TEXT CORPUS ---\n\n" +
                    "Analyze this text corpus and synthesize a structured creator intelligence profile that captures the creator's identity, mission, vision, audience, tone of voice, writing style, preferred call-to-actions, niche, content pillars, expertise areas, strategic goals, signature vocabulary / creator DNA, and signature content writing pattern examples.\n\n" +
                    "Format your response strictly as a JSON object matching this structure (do not include any backticks or extra text outside the JSON):\n" +
                    "{\n" +
                    "  \"creatorIdentity\": \"A summary of who the creator is, their niche, background, and positioning.\",\n" +
                    "  \"creatorMission\": \"The underlying mission or purpose statement that drives their content.\",\n" +
                    "  \"creatorVision\": \"The long-term vision or future target state they aim to establish.\",\n" +
                    "  \"audienceProfile\": \"A description of the target audience, their demographics, pain points, and why they listen.\",\n" +
                    "  \"communicationStyle\": \"A description of the communication tone, pacing, vocabulary, and delivery style (e.g. authoritative, empathetic, conversational).\",\n" +
                    "  \"writingStyle\": \"Specific characteristics of how the creator writes (e.g. sentence structure, use of standard bullet formatting, technical density vs simplicity).\",\n" +
                    "  \"contentStyle\": \"Format preferences, pacing guidelines, hooks, and structures preferred by the creator.\",\n" +
                    "  \"preferredCTAStyle\": \"Persuasion tactics, types of calls-to-action (soft vs hard), and typical action prompts.\",\n" +
                    "  \"niche\": \"The primary topic category or market segment (e.g. tech tutorials, startup finance, lifestyle marketing).\",\n" +
                    "  \"strategicFocus\": \"The primary business focus and content strategies the creator is doubling down on.\",\n" +
                    "  \"personalityTraits\": \"Key attributes describing the creator's public persona (e.g. rigorous, witty, direct).\",\n" +
                    "  \"contentPillars\": \"The top 3-5 recurring themes/topics discussed in their content.\",\n" +
                    "  \"expertiseAreas\": \"The core subjects of expertise demonstrated in the documents.\",\n" +
                    "  \"longTermGoals\": \"The long-term goals and strategic milestones the creator wants to hit.\",\n" +
                    "  \"creatorDNA\": \"Unique signature markers, preferred vocabulary words, rules they follow (e.g., standardizing lists, O(1) jokes).\",\n" +
                    "  \"contentExamples\": \"Signature writing patterns, sentence starters, or typical text paragraph examples extracted from the corpus.\"\n" +
                    "}",
                    brainInput.getKnowledgeText()
            );
        } else if (taskType == AiTaskType.CONTENT_REPURPOSE) {
            ContentRepurposeInput repurposeInput = (ContentRepurposeInput) input;
            prompt = String.format(
                    "You are an expert content repurposer. Repurpose the following original content:\n\n" +
                    "Source Type: %s\n" +
                    "Target Format: %s\n\n" +
                    "--- ORIGINAL CONTENT ---\n" +
                    "%s\n" +
                    "------------------------\n\n" +
                    "Generate a repurposed version optimized for the target format. Also provide suggested hashtags (up to 5) and a call to action (suggestedCTA).\n\n" +
                    "Format your output strictly as a JSON object matching this structure (do not include any backticks or extra text outside the JSON):\n" +
                    "{\n" +
                    "  \"title\": \"A compelling title or hook for the repurposed content\",\n" +
                    "  \"content\": \"The fully repurposed post body or copy matching the target format\",\n" +
                    "  \"suggestedHashtags\": [\"hashtag1\", \"hashtag2\"],\n" +
                    "  \"suggestedCTA\": \"The suggested call to action\"\n" +
                    "}",
                    repurposeInput.getSourceType(),
                    repurposeInput.getTargetFormat(),
                    repurposeInput.getOriginalContent()
            );
        } else {
            throw new IllegalArgumentException("Task type " + taskType + " is not supported by GroqProvider");
        }

        Map<String, Object> requestBody = Map.of(
                "model", "llama-3.3-70b-versatile",
                "messages", List.of(
                        Map.of("role", "user", "content", prompt)
                ),
                "response_format", Map.of(
                        "type", "json_object"
                )
        );

        try {
            log.info("[AI] Executing GroqProvider for {}", taskType);
            String rawResponse = restClient.post()
                    .uri("/openai/v1/chat/completions")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .body(requestBody)
                    .retrieve()
                    .body(String.class);

            JsonNode rootNode = objectMapper.readTree(rawResponse);
            String textResponse = rootNode
                    .path("choices").get(0)
                    .path("message")
                    .path("content").asText();

            String jsonText = textResponse.trim();
            if (jsonText.startsWith("```")) {
                int firstLineEnd = jsonText.indexOf('\n');
                if (firstLineEnd != -1) {
                    jsonText = jsonText.substring(firstLineEnd + 1);
                }
                if (jsonText.endsWith("```")) {
                    jsonText = jsonText.substring(0, jsonText.length() - 3);
                }
                jsonText = jsonText.trim();
            }

            return objectMapper.readValue(jsonText, responseClass);

        } catch (Exception e) {
            log.error("[AI] Groq execution failed: {}", e.getMessage());
            throw new RuntimeException("Groq execution failed: " + e.getMessage(), e);
        }
    }
}
