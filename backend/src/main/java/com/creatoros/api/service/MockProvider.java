package com.creatoros.api.service;

import com.creatoros.api.dto.*;
import com.creatoros.api.model.AiTaskType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class MockProvider implements AiProvider {

    private static final Logger log = LoggerFactory.getLogger(MockProvider.class);

    @Override
    public boolean supports(AiTaskType taskType) {
        return true; // Mock supports all task types
    }

    @Override
    public String getName() {
        return "mock";
    }

    @Override
    public <T, R> R execute(AiTaskType taskType, T input, Class<R> responseClass) {
        log.info("[AI] Running Mock Provider for task: {}", taskType);

        if (taskType == AiTaskType.CONTENT_GENERATION) {
            ContentGenerationInput genInput = (ContentGenerationInput) input;
            GeneratedContent result = generateContentMock(genInput);
            return responseClass.cast(result);
        } else if (taskType == AiTaskType.GROWTH_AUDIT) {
            GrowthAuditInput auditInput = (GrowthAuditInput) input;
            GrowthAuditResult result = generateGrowthAuditMock(auditInput);
            return responseClass.cast(result);
        } else if (taskType == AiTaskType.REEL_ANALYSIS) {
            ReelAnalysisInput reelInput = (ReelAnalysisInput) input;
            ReelAnalysisResult result = generateReelAnalysisMock(reelInput);
            return responseClass.cast(result);
        } else if (taskType == AiTaskType.KNOWLEDGE_SEARCH) {
            KnowledgeSearchInput searchInput = (KnowledgeSearchInput) input;
            KnowledgeSearchResult result = generateKnowledgeSearchMock(searchInput);
            return responseClass.cast(result);
        } else if (taskType == AiTaskType.GROWTH_ADVISOR) {
            GrowthAdvisorInput advisorInput = (GrowthAdvisorInput) input;
            GrowthAdvisorResult result = generateGrowthAdvisorMock(advisorInput);
            return responseClass.cast(result);
        } else if (taskType == AiTaskType.BRAIN_ANALYSIS) {
            BrainAnalysisInput brainInput = (BrainAnalysisInput) input;
            BrainAnalysisResult result = generateBrainAnalysisMock(brainInput);
            return responseClass.cast(result);
        } else if (taskType == AiTaskType.CONTENT_REPURPOSE) {
            ContentRepurposeInput repurposeInput = (ContentRepurposeInput) input;
            ContentRepurposeResult result = generateContentRepurposeMock(repurposeInput);
            return responseClass.cast(result);
        }

        throw new IllegalArgumentException("Unsupported task type in MockProvider: " + taskType);
    }

    private GeneratedContent generateContentMock(ContentGenerationInput input) {
        String topic = input.getTopic();
        String platform = input.getPlatform() != null ? input.getPlatform() : "YouTube";
        String niche = input.getNiche() != null ? input.getNiche() : "content creation";
        String voice = input.getVoice() != null ? input.getVoice() : "engaging";
        String primaryGoal = input.getPrimaryGoal() != null ? input.getPrimaryGoal() : "";

        List<String> hooks = new ArrayList<>();
        List<String> ctas = new ArrayList<>();

        String voicePrefix = "";
        String voiceJoke = "";
        if (voice.contains("humor") || voice.contains("witty")) {
            voicePrefix = "Spoiler alert: ";
            voiceJoke = " (unless you enjoy crying over compiler logs at 3 AM) ";
        } else if (voice.contains("technical") || voice.contains("analytical")) {
            voicePrefix = "Based on metric evaluations: ";
            voiceJoke = " within O(1) complexity bounds ";
        }

        if (primaryGoal.equalsIgnoreCase("Reach")) {
            hooks.add(String.format("%sThis viral secret about %s will double your views!", voicePrefix, topic));
            hooks.add(String.format("The absolute craziest thing about %s. You won't believe this.%s", topic, voiceJoke));
            hooks.add(String.format("Stop scrolling if you want to scale %s in seconds!", topic));
        } else if (primaryGoal.equalsIgnoreCase("Engagement")) {
            hooks.add(String.format("%sIs this the worst way to learn %s? Let's discuss.", voicePrefix, topic));
            hooks.add(String.format("I tried learning %s so you don't have to... but what do you think?%s", topic, voiceJoke));
            hooks.add(String.format("Tell me I'm wrong, but %s is highly overrated. Here's why.", topic));
        } else if (primaryGoal.equalsIgnoreCase("Lead Generation")) {
            hooks.add(String.format("%sAre you struggling with %s? Here is the exact checklist you need.", voicePrefix, topic));
            hooks.add(String.format("Stop wasting hours on %s. Get this free framework instead.%s", topic, voiceJoke));
            hooks.add(String.format("Want to build %s step-by-step? I have a free guide.", topic));
        } else if (primaryGoal.equalsIgnoreCase("Sales / Conversion") || primaryGoal.equalsIgnoreCase("Sales")) {
            hooks.add(String.format("%sHow I scaled my brand using this %s system.", voicePrefix, topic));
            hooks.add(String.format("Why %s is the best investment you will make this week.%s", topic, voiceJoke));
            hooks.add(String.format("If you're not using this %s strategy, you're losing money.", topic));
        } else if (primaryGoal.equalsIgnoreCase("Community Building")) {
            hooks.add(String.format("%sJoin 10k other creators who are building %s together.", voicePrefix, topic));
            hooks.add(String.format("Here is what our creator community learned about %s.%s", topic, voiceJoke));
            hooks.add(String.format("We need to talk about how we collaborate on %s.", topic));
        } else if (primaryGoal.equalsIgnoreCase("Authority Building")) {
            hooks.add(String.format("%sThe industry standard framework for %s.", voicePrefix, topic));
            hooks.add(String.format("Here is the exact method I use to advise six-figure brands on %s.%s", topic, voiceJoke));
            hooks.add(String.format("The scientific breakdown of how %s actually works.", topic));
        } else {
            if (platform.equalsIgnoreCase("TikTok") || platform.equalsIgnoreCase("Instagram")) {
                hooks.add(String.format("Stop scrolling if you want to master %s on %s!", topic, platform));
                hooks.add(String.format("This 15-second hack for %s will blow your mind.", topic));
                hooks.add(String.format("The absolute fastest way to learn %s. No fluff.", topic));
            } else if (platform.equalsIgnoreCase("LinkedIn") || platform.equalsIgnoreCase("Twitter/X")) {
                hooks.add(String.format("Most professionals approach %s completely backwards. Here is a better framework.", topic));
                hooks.add(String.format("I spent 100 hours researching %s so you don't have to. Here is the O(1) breakdown.", topic));
                hooks.add(String.format("Thread: The blueprint for scaling %s in 2026.", topic));
            } else {
                hooks.add(String.format("Most people waste months learning %s the wrong way. Here is the 3-part guide.", topic));
                hooks.add(String.format("AI is changing how we do %s. Here is how to keep up.", topic));
                hooks.add(String.format("I tried every method for %s. This is the only one that actually worked.", topic));
            }
        }

        String scriptAngle = "baseline structure";
        if (primaryGoal.equalsIgnoreCase("Reach")) {
            scriptAngle = "high visual hook pacing and rapid editing templates";
        } else if (primaryGoal.equalsIgnoreCase("Engagement")) {
            scriptAngle = "audience conversation starters and direct question overlays";
        } else if (primaryGoal.equalsIgnoreCase("Lead Generation")) {
            scriptAngle = "identifying core pain points and introducing a downloadable solution";
        } else if (primaryGoal.equalsIgnoreCase("Sales / Conversion") || primaryGoal.equalsIgnoreCase("Sales")) {
            scriptAngle = "handling primary user objections and presenting a clear conversion offer";
        } else if (primaryGoal.equalsIgnoreCase("Community Building")) {
            scriptAngle = "sharing community experiences and inviting collaboration";
        } else if (primaryGoal.equalsIgnoreCase("Authority Building")) {
            scriptAngle = "detailing industry case studies and high-credibility frameworks";
        }

        String script = String.format(
                "Part 1: The Context Setup.\n" +
                "Welcome back! If you are aiming to build a brand in the '%s' niche, you must master '%s'. " +
                "Most creators start with complicated setups, but the secret is starting with clean, repeatable systems.\n\n" +
                "Part 2: The Core Strategy.\n" +
                "First, define your specific viewer pain point. Second, establish a baseline structure. " +
                "For %s, this means focus on %s. Let's optimize this step by step%s.\n\n" +
                "Part 3: The Iteration.\n" +
                "Finally, look at the analytics curves. Don't guess what works; let viewer behavior dictate your next content cycle.",
                niche, topic, topic, scriptAngle, voiceJoke
        );

        if (primaryGoal.equalsIgnoreCase("Reach")) {
            ctas.add("Share this video with a creator friend!");
            ctas.add("Save this post for your next project session!");
        } else if (primaryGoal.equalsIgnoreCase("Engagement")) {
            ctas.add("Let me know your thoughts in the comments below!");
            ctas.add("Which tip was your favorite? Drop your opinion!");
        } else if (primaryGoal.equalsIgnoreCase("Lead Generation")) {
            ctas.add(String.format("Grab my free %s blueprint template at the link in bio!", topic));
            ctas.add("Comment 'GUIDE' below and I will DM you the link!");
        } else if (primaryGoal.equalsIgnoreCase("Sales / Conversion") || primaryGoal.equalsIgnoreCase("Sales")) {
            ctas.add("Click the link in my bio to enroll in the masterclass today!");
            ctas.add("Get the complete guide now and start scaling!");
        } else if (primaryGoal.equalsIgnoreCase("Community Building")) {
            ctas.add("Join our free Discord community using the link in bio!");
            ctas.add("Welcome to the community, subscribe to stay connected!");
        } else if (primaryGoal.equalsIgnoreCase("Authority Building")) {
            ctas.add(String.format("Follow for daily expert-level %s strategies.", niche));
            ctas.add("Read the full case study outline linked in my bio.");
        } else {
            if (platform.equalsIgnoreCase("TikTok") || platform.equalsIgnoreCase("Instagram")) {
                ctas.add("Double tap and follow for daily creator tips!");
                ctas.add(String.format("Check my link in bio to get my free %s resource template.", topic));
            } else if (platform.equalsIgnoreCase("LinkedIn") || platform.equalsIgnoreCase("Twitter/X")) {
                ctas.add("If you found this valuable, share it with your network!");
                ctas.add(String.format("Subscribe to my newsletter for deep dives on %s.", topic));
            } else {
                ctas.add(String.format("Subscribe for more practical %s growth strategies.", niche));
                ctas.add(String.format("Grab my free %s blueprint sheet using the link in description.", topic));
            }
        }

        return GeneratedContent.builder()
                .hooks(hooks)
                .script(script)
                .ctas(ctas)
                .build();
    }

    private GrowthAuditResult generateGrowthAuditMock(GrowthAuditInput input) {
        long seed = (input.getCreatorName() + input.getNiche() + input.getPlatform()).hashCode();
        Random rand = new Random(seed);

        int contentScore = 50 + rand.nextInt(41);
        int engagementScore = 50 + rand.nextInt(41);
        int consistencyScore = 50 + rand.nextInt(41);
        int audienceScore = 50 + rand.nextInt(41);
        int overallScore = (contentScore + engagementScore + consistencyScore + audienceScore) / 4;

        List<String> strengths = new ArrayList<>();
        List<String> weaknesses = new ArrayList<>();
        List<GrowthAuditResult.Recommendation> recommendations = new ArrayList<>();

        if (contentScore >= 70) {
            strengths.add("Audience retention metrics are stable relative to category standards.");
        } else {
            weaknesses.add("High initial abandonment. Retention curve drops severely in the first 30 seconds.");
            recommendations.add(GrowthAuditResult.Recommendation.builder()
                    .title("Re-engineer the 30-Second Hook")
                    .description("Remove long intros or static slides and state the exact payoff in the first 15 seconds.")
                    .impact("HIGH")
                    .category("CONTENT")
                    .build());
        }

        if (input.getCtr() >= 6.0) {
            strengths.add("Strong visual click-through rate. Title hook structure is performing above average.");
        } else {
            weaknesses.add("Thumbnail CTR is lagging. Discoverability is throttled.");
            recommendations.add(GrowthAuditResult.Recommendation.builder()
                    .title("Split-Test Title and Image Art")
                    .description("Increase visual contrast on thumbnails and write 3 curiosity-gap titles.")
                    .impact("HIGH")
                    .category("SEO")
                    .build());
        }

        if (input.getWeeklyUploads() >= 3) {
            strengths.add("Consistent posting rhythm. Maintaining healthy pipeline volume.");
        } else {
            weaknesses.add("Inconsistent publishing schedule degrades search index authority.");
            recommendations.add(GrowthAuditResult.Recommendation.builder()
                    .title("Establish a 2-Week Content Buffer")
                    .description("Dedicate one batch session to produce evergreen backups to absorb gaps.")
                    .impact("MEDIUM")
                    .category("CONTENT")
                    .build());
        }

        if (strengths.isEmpty()) {
            strengths.add("Baseline community parameters are stable.");
        }
        if (weaknesses.isEmpty()) {
            weaknesses.add("No immediate metrics bottlenecks detected. Focus on scale.");
            recommendations.add(GrowthAuditResult.Recommendation.builder()
                    .title("Scale Content Operations")
                    .description("Repurpose high-performing long form posts into short reels to capture new audience demographics.")
                    .impact("LOW")
                    .category("MONETIZATION")
                    .build());
        }

        String summary = String.format("Growth audit completed (Mock Fallback). Creator %s inside %s niche has an overall performance score of %d/100.",
                input.getCreatorName(), input.getNiche(), overallScore);

        return GrowthAuditResult.builder()
                .growthScore(overallScore)
                .contentScore(contentScore)
                .engagementScore(engagementScore)
                .consistencyScore(consistencyScore)
                .audienceScore(audienceScore)
                .summary(summary)
                .strengths(strengths)
                .weaknesses(weaknesses)
                .recommendations(recommendations)
                .build();
    }

    private ReelAnalysisResult generateReelAnalysisMock(ReelAnalysisInput input) {
        int estimatedDuration = Math.max(5, Math.min(60, (int) (input.getFileSize() / (1024 * 1024))));
        long seed = (long) (input.getFileName() != null ? input.getFileName() : (input.getReelUrl() != null ? input.getReelUrl() : "default")).hashCode();
        Random random = new Random(seed);

        int hookScore = 40 + random.nextInt(61);
        int retentionScore = 40 + random.nextInt(61);
        int ctaScore = 40 + random.nextInt(61);
        int contentScore = 40 + random.nextInt(61);
        int overallScore = (hookScore + retentionScore + ctaScore + contentScore) / 4;

        List<String> strengths = new ArrayList<>();
        List<String> weaknesses = new ArrayList<>();
        List<String> recommendations = new ArrayList<>();

        if (hookScore >= 75) {
            strengths.add("Strong curiosity-based opening statement captures immediate attention.");
        } else {
            weaknesses.add("Intro hook lacks high stakes or direct emotional resonance.");
            recommendations.add("Open with stronger curiosity-based statements or a bold, contrasting text overlay.");
        }

        if (retentionScore >= 75) {
            strengths.add("Pacing stays engaging with transitions.");
        } else {
            weaknesses.add("Slow segment transitions cause minor audience interest drops.");
            recommendations.add("Reduce intro length, speed up pauses, and reach the core value faster.");
        }

        if (ctaScore >= 75) {
            strengths.add("Clear, single-action request positioned at the end.");
        } else {
            weaknesses.add("Final Call-to-Action is soft or easily missed.");
            recommendations.add("Include a clearer action request during the final 3 seconds.");
        }

        String captionAnalysis = "The current caption is structured nicely, but could benefit from line breaks and a stronger hook in the first sentence. Adding 3-5 hyper-relevant niche hashtags will boost indexability.";
        String ctaAnalysis = "The call to action is present but soft. To increase conversion, specify exactly what value the user gets (e.g., 'Comment GUIDE to get it') and place it both in the caption and as an end-screen overlay.";
        String retentionPrediction = "Expect a standard retention curve drop of 15% in the first 3 seconds due to a slow visual transition. Retention should stabilize once the core tip is introduced, with a secondary drop at 22 seconds.";
        String viralPotential = String.format("Viral potential is promising. Estimated reach index: %d/100. Key optimization: Trim the opening frame by 0.5s to speed up time-to-value.", overallScore + 5);
        String hookAnalysis = "The video opens with a strong conceptual statement but lacks visual momentum. To maximize 3-second retention, insert a dynamic text graphic or a high-contrast pattern break within the first 1.5 seconds.";

        return ReelAnalysisResult.builder()
                .durationSeconds(estimatedDuration)
                .hookScore(hookScore)
                .retentionScore(retentionScore)
                .ctaScore(ctaScore)
                .contentScore(contentScore)
                .overallScore(overallScore)
                .strengths(strengths)
                .weaknesses(weaknesses)
                .recommendations(recommendations)
                .captionAnalysis(captionAnalysis)
                .ctaAnalysis(ctaAnalysis)
                .retentionPrediction(retentionPrediction)
                .viralPotential(viralPotential)
                .hookAnalysis(hookAnalysis)
                .build();
    }

    private KnowledgeSearchResult generateKnowledgeSearchMock(KnowledgeSearchInput input) {
        String query = input.getQuery() != null ? input.getQuery().toLowerCase().trim() : "";
        List<KnowledgeSearchInput.DocumentCandidate> candidates = input.getCandidates();

        if (candidates == null || candidates.isEmpty()) {
            return KnowledgeSearchResult.builder().matches(List.of()).build();
        }

        if (query.isEmpty()) {
            return KnowledgeSearchResult.builder()
                    .matches(candidates.stream()
                            .map(c -> {
                                String content = c.getContent() != null ? c.getContent() : "";
                                String excerpt = content.length() > 180 ? content.substring(0, 180) + "..." : content;
                                return KnowledgeSearchResult.Match.builder()
                                        .documentId(c.getDocumentId())
                                        .fileName(c.getFileName())
                                        .excerpt(excerpt)
                                        .relevanceScore(0.5)
                                        .build();
                            })
                            .collect(Collectors.toList()))
                    .build();
        }

        String[] queryWords = query.split("\\s+");
        List<KnowledgeSearchResult.Match> matches = new ArrayList<>();

        for (KnowledgeSearchInput.DocumentCandidate c : candidates) {
            String fileName = c.getFileName() != null ? c.getFileName().toLowerCase() : "";
            String content = c.getContent() != null ? c.getContent().toLowerCase() : "";

            double matchCount = 0;
            for (String word : queryWords) {
                if (fileName.contains(word) || content.contains(word)) {
                    matchCount++;
                }
            }

            double relevanceScore = 0.0;
            if (matchCount > 0) {
                relevanceScore = 0.1 + 0.9 * (matchCount / queryWords.length);
            }

            if (relevanceScore > 0) {
                String rawContent = c.getContent() != null ? c.getContent() : "";
                String excerpt;
                int queryIndex = rawContent.toLowerCase().indexOf(queryWords[0]);
                if (queryIndex != -1) {
                    int start = Math.max(0, queryIndex - 40);
                    int end = Math.min(rawContent.length(), queryIndex + 140);
                    excerpt = (start > 0 ? "..." : "") + rawContent.substring(start, end) + (end < rawContent.length() ? "..." : "");
                } else {
                    excerpt = rawContent.length() > 180 ? rawContent.substring(0, 180) + "..." : rawContent;
                }

                matches.add(KnowledgeSearchResult.Match.builder()
                        .documentId(c.getDocumentId())
                        .fileName(c.getFileName())
                        .excerpt(excerpt)
                        .relevanceScore(relevanceScore)
                        .build());
            }
        }

        matches.sort(Comparator.comparingDouble(KnowledgeSearchResult.Match::getRelevanceScore).reversed());

        return KnowledgeSearchResult.builder()
                .matches(matches)
                .build();
    }

    private GrowthAdvisorResult generateGrowthAdvisorMock(GrowthAdvisorInput input) {
        log.info("[AI] Running Mock Provider for GROWTH_ADVISOR");
        ChannelMetadata meta = input.getMetadata();
        String platformName = meta.getPlatform().equalsIgnoreCase("youtube") ? "YouTube channel" : "Instagram";
        String lowerHandle = meta.getHandle().toLowerCase();
        
        String summary;
        List<String> strengths;
        List<String> weaknesses;
        List<String> opportunities;
        List<String> contentGaps;
        List<String> recommendations;
        String roadmap;

        if (lowerHandle.contains("mrbeast")) {
            if ("PROFILE_ONLY".equals(meta.getAnalysisMode())) {
                summary = String.format(
                        "I could identify this as a %s profile, but detailed analytics are unavailable from public sources. Recommendations are based on channel positioning, branding, content strategy, and niche best practices. " +
                        "Analyzing @mrbeast on %s, the profile shows a world-class viral entertainment positioning built around extreme challenges, massive philanthropy, and high-retention thumbnail/title hooks.",
                        platformName, platformName
                );
            } else {
                summary = String.format(
                        "This is a comprehensive public channel report for @mrbeast on %s. The channel occupying the viral entertainment space has massive distribution metrics. With %s subscribers and %s videos indexed, the content positioning is optimized for mass retention.",
                        platformName, meta.getSubscriberCount() != null ? meta.getSubscriberCount() : "N/A", meta.getVideoCount() != null ? meta.getVideoCount() : "N/A"
                );
            }

            strengths = List.of(
                    "World-class visual thumb-hook and title optimization driving massive CTR.",
                    "High pacing frequency and immediate retention editing to maximize watch time.",
                    "Unmatched scaling capabilities with global multi-language audio track localization."
            );

            weaknesses = List.of(
                    "Extreme viral pacing structure makes deep narrative connection or long-form storytelling difficult.",
                    "High production cost structure is hard to duplicate for sub-channels or spin-off series.",
                    "Underutilized direct monetization conversions to brand products beyond massive sponsors."
            );

            opportunities = List.of(
                    "Leverage localized channel assets to cross-promote digital brand properties globally.",
                    "Introduce a membership-only behind-the-scenes format to drive direct recurring user revenue.",
                    "Collaborate with education/tech channels to cross-pollinate and diversify the viewer base."
            );

            contentGaps = List.of(
                    "Documentary-style behind-the-scenes series detailing the complex engineering of main-channel sets.",
                    "Interactive viewer polls and challenges directly integrated with backend digital web experiences.",
                    "Objection-handling scripts explaining operational costs and philanthropic transparency."
            );

            recommendations = List.of(
                    "Embed direct digital-product conversions in top-pinned comments on all localized channels.",
                    "Introduce slower, conversational spin-off videos to build a stronger connection with core fans.",
                    "Create customized community challenges that reward active digital community participation."
            );

            roadmap = 
                    "Week 1: Pacing & Retention Audit\n" +
                    "- Analyze first 3-second dropoff curves across recently launched main channel videos.\n" +
                    "- Refine secondary channel thumbnail text layouts to optimize mobile click-through.\n\n" +
                    "Week 2: Pinned Comment CTA Setup\n" +
                    "- Implement high-converting digital sign-up links on top-pinned comments.\n" +
                    "- Monitor click-through rates from Beast Philanthropy descriptions.\n\n" +
                    "Week 3: Localized Audio Review\n" +
                    "- Review localized translation script pacing for upcoming video drafts.\n" +
                    "- Sync Portuguese and Spanish voiceover tracks with visual pacing.\n\n" +
                    "Week 4: Documentary Series Prep\n" +
                    "- Script a 3-part behind-the-scenes documentary series on set engineering.\n" +
                    "- Test custom end-screen cards directing main channel traffic to the new series.";

        } else if (lowerHandle.contains("aliabdaal") || lowerHandle.contains("abdaal")) {
            if ("PROFILE_ONLY".equals(meta.getAnalysisMode())) {
                summary = String.format(
                        "I could identify this as a %s profile, but detailed analytics are unavailable from public sources. Recommendations are based on channel positioning, branding, content strategy, and niche best practices. " +
                        "Analyzing @aliabdaal on %s, the channel brand is built around productivity, lifestyle design, and evidence-based self-improvement with a warm, conversational persona.",
                        platformName, platformName
                );
            } else {
                summary = String.format(
                        "This is a comprehensive public channel report for @aliabdaal on %s. The channel occupying the self-improvement/productivity space has a highly engaged catalog. With %s subscribers and %s videos indexed, the content positioning is authoritative.",
                        platformName, meta.getSubscriberCount() != null ? meta.getSubscriberCount() : "N/A", meta.getVideoCount() != null ? meta.getVideoCount() : "N/A"
                );
            }

            strengths = List.of(
                    "Warm, conversational, and highly trustworthy delivery style that builds instant rapport.",
                    "Consistent aesthetic branding with premium typography and clean minimalist visuals.",
                    "Deep catalog search optimization for long-tail productivity and study-tactic queries."
            );

            weaknesses = List.of(
                    "Niche saturation and potential audience fatigue from repetitive time-management/study topics.",
                    "Over-reliance on talking-head talking formats with insufficient dynamic b-roll pacing.",
                    "Lack of clear branding differentiators in the crowded 'how to get rich' and productivity market."
            );

            opportunities = List.of(
                    "Develop specialized premium cohort programs targeting mid-career corporate professionals.",
                    "Host a serialized podcast focusing exclusively on creator business architectures and scaling.",
                    "Create a structured newsletter summary series to drive active traffic off-platform."
            );

            contentGaps = List.of(
                    "Detailed transparent breakdowns of the creator's backend business operations and costs.",
                    "Productivity experiments showing real failures, raw struggles, and unedited schedules.",
                    "Direct tactical tutorials on software tools, writing systems, and creator workflows."
            );

            recommendations = List.of(
                    "Test a weekly 'Behind the Business' series with transparent revenue and team structure metrics.",
                    "Integrate dynamic B-roll and screen recordings every 10-15 seconds to boost retention.",
                    "Redesign description boxes to place the free weekly newsletter link above the fold."
            );

            roadmap = 
                    "Week 1: Niche Transition Blueprint\n" +
                    "- Draft three core pillars for the new 'Creator Economy Operations' content strategy.\n" +
                    "- Audit past productivity playlist metrics to locate high-performing evergreen topics.\n\n" +
                    "Week 2: Description Optimization\n" +
                    "- Redesign description templates to highlight newsletter signups above the fold.\n" +
                    "- Set up simple Google Analytics tracking for description links.\n\n" +
                    "Week 3: Visual Pacing Upgrades\n" +
                    "- Script the next two videos using multi-cam angles and interactive whiteboard sketches.\n" +
                    "- Audit retention dropoffs during silent or slow transition periods.\n\n" +
                    "Week 4: Community Tab Test\n" +
                    "- Launch a structured community post campaign asking viewers about their business pain points.\n" +
                    "- Launch pre-sell page for the upcoming Creator Operations cohort.";

        } else if (lowerHandle.contains("mkbhd") || lowerHandle.contains("marques") || lowerHandle.contains("brownlee")) {
            if ("PROFILE_ONLY".equals(meta.getAnalysisMode())) {
                summary = String.format(
                        "I could identify this as a %s profile, but detailed analytics are unavailable from public sources. Recommendations are based on channel positioning, branding, content strategy, and niche best practices. " +
                        "Analyzing @mkbhd on %s, the profile shows an industry-standard consumer tech review positioning utilizing cinematic visuals and highly respected technical commentary.",
                        platformName, platformName
                );
            } else {
                summary = String.format(
                        "This is a comprehensive public channel report for @mkbhd on %s. The channel occupying the consumer technology space has top-tier authority. With %s subscribers and %s videos, the content positioning is cinematic.",
                        platformName, meta.getSubscriberCount() != null ? meta.getSubscriberCount() : "N/A", meta.getVideoCount() != null ? meta.getVideoCount() : "N/A"
                );
            }

            strengths = List.of(
                    "Cinematic RED-camera production value and flawless editing style.",
                    "Deep trust and industry-recognized authority in consumer electronics reviews.",
                    "Highly consistent branding, iconic minimalist studio backdrop, and professional pacing."
            );

            weaknesses = List.of(
                    "Heavy content calendar dependency on external consumer hardware release schedules.",
                    "Minimal off-platform direct digital monetization models beyond sponsorships and AdSense.",
                    "Long production timelines making it difficult to react rapidly to trending breaking news."
            );

            opportunities = List.of(
                    "Launch premium hardware-curated subscription boxes with direct brand collaborations.",
                    "Create a software-focused review playlist targeting developer toolkits and AI models.",
                    "Run live interactive tech QA streams with active audience polls."
            );

            contentGaps = List.of(
                    "Explorations of the production stack, studio workflow, and camera rigs behind MKBHD.",
                    "Software reviews detailing coding/development tools beyond consumer phone updates.",
                    "Strategic analyses of future technology economics and hardware supply chain trends."
            );

            recommendations = List.of(
                    "Diversify sponsorships to include developer-oriented SaaS and cloud platforms.",
                    "Create a second-channel news program to cover tech breakthroughs in under 3 minutes.",
                    "Integrate interactive product spec cards directly into description boxes."
            );

            roadmap = 
                    "Week 1: Software Review Strategy\n" +
                    "- Script a software-focused video analyzing AI developer APIs and local LLM performance.\n" +
                    "- Review community comments to compile a list of requested hardware tools.\n\n" +
                    "Week 2: Short-Form News Pilot\n" +
                    "- Draft and shoot three tech news briefs on the Waveform channel.\n" +
                    "- Analyze retention rates of tech briefs compared to full-length episodes.\n\n" +
                    "Week 3: Behind the Camera Series\n" +
                    "- Edit a studio walkthrough video showcasing camera workflow and edit templates.\n" +
                    "- Embed affiliate links for all highlighted gear in the description.\n\n" +
                    "Week 4: Tech Spec Cards Setup\n" +
                    "- Design dynamic Tech Spec card templates for the description box of upcoming reviews.\n" +
                    "- Measure CTR to sponsor links from optimized card positions.";

        } else {
            if ("PROFILE_ONLY".equals(meta.getAnalysisMode())) {
                summary = String.format(
                        "I could identify this as a %s profile, but detailed analytics are unavailable from public sources. Recommendations are based on channel positioning, branding, content strategy, and niche best practices. " +
                        "Analyzing %s (%s), the branding presence indicates an opportunity to carve a stronger conceptual footprint. Focusing on the suggested niche '%s' can unify content topics.",
                        platformName, meta.getHandle(), platformName, input.getNiche() != null ? input.getNiche() : "General Creator"
                );
            } else {
                summary = String.format(
                        "This is a comprehensive public channel report for %s (%s). The channel '%s' occupying the '%s' space has healthy visibility. " +
                        "With %s subscribers/followers and %s videos indexed, the content positioning is well-defined.",
                        meta.getHandle(), platformName, meta.getTitle(), input.getNiche() != null ? input.getNiche() : "General Creator",
                        platformName.equals("YouTube channel") ? meta.getSubscriberCount() : meta.getFollowers(),
                        meta.getVideoCount() != null ? meta.getVideoCount() : "N/A"
                );
            }

            strengths = List.of(
                    "Consistent visual identity across profile elements.",
                    "Strong positioning alignment in bio/description copy.",
                    "High authority signals in core branding statement."
            );

            weaknesses = List.of(
                    "Lack of high-conversion lead generation pathways in link-in-bio.",
                    "Inconsistent posting cadence causing search engine index volatility.",
                    "Underutilized video description SEO optimization."
            );

            opportunities = List.of(
                    "Expand short-form content distribution to capture top-of-funnel reach.",
                    "Collaborate with niche peers to cross-pollinate creator audiences.",
                    "Create a dedicated community newsletter to capture active subscribers."
            );

            contentGaps = List.of(
                    "Objection-handling scripts addressing audience hesitations in details.",
                    "Case-study teardowns detailing specific creator transformations.",
                    "Behind-the-scenes editing workflow tutorials."
            );

            recommendations = List.of(
                    "Audit link-in-bio structure and replace general links with a specific lead magnet callout.",
                    "Optimise first two lines of video descriptions with keyword-rich positioning text.",
                    "Establish a batch filming workflow to maintain a 2-week backlog of evergreen content."
            );

            roadmap = 
                    "Week 1: Foundations & SEO Cleanup\n" +
                    "- Update bio description to align exactly with target keywords.\n" +
                    "- Restructure profile landing page link to point directly to a clean lead magnet page.\n\n" +
                    "Week 2: Content Gap Execution\n" +
                    "- Publish 2 case-study teardowns addressing primary viewer objections.\n" +
                    "- Set up custom thumbnail text layouts to increase click-through metrics.\n\n" +
                    "Week 3: Distribution & Batching\n" +
                    "- Film 5 repurposed vertical shorts to capture top-of-funnel reach.\n" +
                    "- Integrate dynamic CTA cues in the middle 30 seconds of videos.\n\n" +
                    "Week 4: Review & Analytics Feedback\n" +
                    "- Compare retention curves of recent uploads against historical averages.\n" +
                    "- Iterate hook scripts based on early dropoff trends.";
        }

        return GrowthAdvisorResult.builder()
                .profileSummary(summary)
                .strengths(strengths)
                .weaknesses(weaknesses)
                .opportunities(opportunities)
                .contentGaps(contentGaps)
                .recommendations(recommendations)
                .growthRoadmap(roadmap)
                .build();
    }

    private BrainAnalysisResult generateBrainAnalysisMock(BrainAnalysisInput input) {
        log.info("[AI] Running Mock Provider for BRAIN_ANALYSIS");
        return BrainAnalysisResult.builder()
                .creatorIdentity("A high-performance technical content creator focusing on software engineering, Next.js web application optimizations, database architectures, and advanced agentic AI developers tutorials.")
                .creatorMission("To translate complex, advanced system engineering and AI design topics into highly accessible, bullet-standardized, and actionable creator resources.")
                .creatorVision("To build the pre-eminent open source learning hub for developers exploring advanced autonomous agent architectures and production-level optimizations.")
                .audienceProfile("Mid-level to senior software engineers, frontend architects, AI hackers, and technical content developers who look for direct value without generic fillers.")
                .communicationStyle("Conversational yet technically rigorous, combining dry programming humor (e.g. debugging at 3 AM) with authoritative metrics and case study analysis.")
                .writingStyle("Highly structured, standardizing all lists to unified bullet points, incorporating clean code fragments, and keeping sentences short and scannable.")
                .contentStyle("3-part conceptual frameworks: hook with immediate stakes, core technical walkthrough, and loop back with data-driven iteration suggestions.")
                .preferredCTAStyle("Value-centric prompts, such as offering detailed resources and guides directly via bios, or asking viewers to comment niche keywords for automation triggers.")
                .niche("Software Engineering and AI Agent Development")
                .strategicFocus("Doubling down on advanced system architectures, compiler optimizations, autonomous agent orchestration, and clean code principles.")
                .personalityTraits("Meticulous, authoritative, witty, empathetic to developer struggles.")
                .contentPillars("Advanced AI Agents, Next.js Compiler Speed, PostgreSQL Tuning, High-Cadence Batching")
                .expertiseAreas("React, Next.js, Spring Boot APIs, PostgreSQL Dialects, JCodec Frame Parsing, Puppeteer automation scripting.")
                .longTermGoals("Position as the go-to authority in the AI agent development ecosystem and build an active developer community of 100k engineers.")
                .creatorDNA("Uses compiler error humor, advocates batching content backlogs, enforces standardized bullet spacing, rejects generic metric targets.")
                .contentExamples("- Hook: 'Most developers write O(N) database queries when they could hit O(1). Here is the exact PostgreSQL optimization template.'\n- Transition: 'Let's open the config and verify this layout step by step.'\n- CTA: 'Grab my complete system architecture diagram linked in my bio!'")
                .build();
    }

    private ContentRepurposeResult generateContentRepurposeMock(ContentRepurposeInput input) {
        String original = input.getOriginalContent() != null ? input.getOriginalContent() : "";
        SourceType source = input.getSourceType() != null ? input.getSourceType() : SourceType.POST;
        TargetFormat target = input.getTargetFormat() != null ? input.getTargetFormat() : TargetFormat.LINKEDIN_POST;

        String title = String.format("Repurposed %s to %s", source, target);
        String content = String.format(
                "Here is the repurposed content optimized for %s:\n\n" +
                "Original summary:\n%s\n\n" +
                "Key takeaways repackaged for maximum engagement on %s.",
                target,
                original.length() > 100 ? original.substring(0, 100) + "..." : original,
                target
        );

        return ContentRepurposeResult.builder()
                .title(title)
                .content(content)
                .suggestedHashtags(List.of("repurpose", source.toString().toLowerCase(), target.toString().toLowerCase()))
                .suggestedCTA(String.format("Share your thoughts on this %s conversion!", target))
                .build();
    }
}
