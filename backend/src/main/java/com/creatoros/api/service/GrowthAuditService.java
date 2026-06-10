package com.creatoros.api.service;

import com.creatoros.api.dto.GrowthAuditDto;
import com.creatoros.api.dto.GrowthAuditInput;
import com.creatoros.api.dto.GrowthAuditResult;
import com.creatoros.api.dto.GrowthRecommendationDto;
import com.creatoros.api.model.*;
import com.creatoros.api.repository.GrowthAuditRepository;
import com.creatoros.api.repository.GrowthRecommendationRepository;
import com.creatoros.api.repository.WorkspaceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GrowthAuditService {

    private final GrowthAuditRepository growthAuditRepository;
    private final GrowthRecommendationRepository growthRecommendationRepository;
    private final WorkspaceRepository workspaceRepository;
    private final AiProviderRouter aiProviderRouter;

    @Transactional(readOnly = true)
    public List<GrowthAuditDto> getAuditHistory(User creator, UUID workspaceId) {
        // Validate workspace ownership
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        return growthAuditRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Optional<GrowthAuditDto> getLatestAudit(User creator, UUID workspaceId) {
        // Validate workspace ownership
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        return growthAuditRepository.findFirstByWorkspaceIdOrderByCreatedAtDesc(workspaceId)
                .map(this::mapToDto);
    }

    @Transactional
    public GrowthAuditDto runAudit(User creator, UUID workspaceId) {
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        CreatorProfile profile = workspace.getCreatorProfile();
        if (profile == null) {
            throw new IllegalArgumentException("Please complete your Creator Profile before running a Growth Audit.");
        }

        // 1. Generate Deterministic Mock Analytics based on profile attributes
        String seedString = (profile.getCreatorName() != null ? profile.getCreatorName() : "")
                + (profile.getNiche() != null ? profile.getNiche() : "")
                + (profile.getPrimaryPlatform() != null ? profile.getPrimaryPlatform() : "")
                + (profile.getPostingFrequency() != null ? profile.getPostingFrequency() : "")
                + workspaceId.toString();

        long seed = seedString.hashCode();
        Random rand = new Random(seed);

        String platform = profile.getPrimaryPlatform();
        if (platform == null || platform.isEmpty()) {
            platform = "YouTube";
        }

        // Metrics Base ranges
        long subscribers;
        long views;
        double ctr;
        int avdSeconds;
        int weeklyUploads;

        // Determine posting uploads based on profile input
        String freq = profile.getPostingFrequency() != null ? profile.getPostingFrequency().toLowerCase() : "";
        if (freq.contains("daily")) {
            weeklyUploads = 5 + rand.nextInt(3); // 5 to 7
        } else if (freq.contains("twice") || freq.contains("2")) {
            weeklyUploads = 2;
        } else if (freq.contains("three") || freq.contains("3")) {
            weeklyUploads = 3;
        } else if (freq.isEmpty() || freq.contains("weekly") || freq.contains("1")) {
            weeklyUploads = 1;
        } else {
            weeklyUploads = rand.nextInt(2) + 1; // 1 or 2
        }

        // Determine views/subs/ctr/avd based on platform
        if (platform.equalsIgnoreCase("YouTube")) {
            subscribers = 5000L + rand.nextInt(95000); // 5k to 100k
            views = subscribers * (10L + rand.nextInt(40)); // 50k to 5M
            ctr = 4.0 + rand.nextDouble() * 6.0; // 4.0% to 10.0%
            avdSeconds = 180 + rand.nextInt(360); // 3m to 9m
        } else if (platform.equalsIgnoreCase("TikTok") || platform.equalsIgnoreCase("Instagram")) {
            subscribers = 10000L + rand.nextInt(190000); // 10k to 200k
            views = subscribers * (20L + rand.nextInt(80)); // 200k to 16M
            ctr = 1.0 + rand.nextDouble() * 3.0; // 1.0% to 4.0% (not as relevant for short form)
            avdSeconds = 12 + rand.nextInt(18); // 12s to 30s
        } else if (platform.equalsIgnoreCase("LinkedIn") || platform.equalsIgnoreCase("Twitter/X")) {
            subscribers = 1500L + rand.nextInt(18500); // 1.5k to 20k
            views = subscribers * (5L + rand.nextInt(20)); // 7.5k to 400k impressions
            ctr = 2.0 + rand.nextDouble() * 5.0; // 2.0% to 7.0% link/click rates
            avdSeconds = 0; // Not applicable for text posts
        } else {
            subscribers = 2000L + rand.nextInt(50000);
            views = subscribers * 15L;
            ctr = 5.0;
            avdSeconds = 60;
        }

        // 2. Execute growth audit via AiProviderRouter
        GrowthAuditInput auditInput = GrowthAuditInput.builder()
                .creatorName(profile.getCreatorName() != null ? profile.getCreatorName() : "Creator")
                .niche(profile.getNiche() != null ? profile.getNiche() : "general content creation")
                .platform(platform)
                .subscribers(subscribers)
                .views(views)
                .ctr(ctr)
                .weeklyUploads(weeklyUploads)
                .avdSeconds(avdSeconds)
                .brandVoice(profile.getBrandVoice() != null ? profile.getBrandVoice() : "engaging")
                .build();

        GrowthAuditResult auditResult = aiProviderRouter.executeWithFallback(
                AiTaskType.GROWTH_AUDIT,
                auditInput,
                GrowthAuditResult.class
        );

        GrowthAudit audit = GrowthAudit.builder()
                .workspace(workspace)
                .growthScore(auditResult.getGrowthScore())
                .contentScore(auditResult.getContentScore())
                .engagementScore(auditResult.getEngagementScore())
                .consistencyScore(auditResult.getConsistencyScore())
                .audienceScore(auditResult.getAudienceScore())
                .summary(auditResult.getSummary())
                .views(views)
                .subscribers(subscribers)
                .ctr(ctr)
                .avdSeconds(avdSeconds)
                .weeklyUploads(weeklyUploads)
                .strengths(auditResult.getStrengths())
                .weaknesses(auditResult.getWeaknesses())
                .build();

        List<GrowthRecommendation> recommendations = new ArrayList<>();
        if (auditResult.getRecommendations() != null) {
            for (GrowthAuditResult.Recommendation recResult : auditResult.getRecommendations()) {
                recommendations.add(GrowthRecommendation.builder()
                        .audit(audit)
                        .title(recResult.getTitle())
                        .description(recResult.getDescription())
                        .impact(recResult.getImpact())
                        .category(recResult.getCategory())
                        .status("PENDING")
                        .build());
            }
        }

        if (recommendations.isEmpty()) {
            recommendations.add(GrowthRecommendation.builder()
                    .audit(audit)
                    .title("Scale Content Operations")
                    .description("All core metrics are performing optimally. Repurpose high-performing long form posts into short reels to capture new audience demographics.")
                    .impact("LOW")
                    .category("MONETIZATION")
                    .status("PENDING")
                    .build());
        }

        audit.setRecommendations(recommendations);
        GrowthAudit savedAudit = growthAuditRepository.save(audit);
        return mapToDto(savedAudit);
    }

    @Transactional
    public void patchRecommendationStatus(User creator, UUID workspaceId, UUID recommendationId, String status) {
        // Validate workspace ownership
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        GrowthRecommendation rec = growthRecommendationRepository.findById(recommendationId)
                .orElseThrow(() -> new IllegalArgumentException("Recommendation not found"));

        // Verify recommendation belongs to the workspace
        if (!rec.getAudit().getWorkspace().getId().equals(workspaceId)) {
            throw new IllegalArgumentException("Unauthorized recommendation status change");
        }

        if (!status.equals("PENDING") && !status.equals("IN_PROGRESS") && !status.equals("COMPLETED")) {
            throw new IllegalArgumentException("Invalid recommendation status: " + status);
        }

        rec.setStatus(status);
        growthRecommendationRepository.save(rec);
    }

    // Secondary score algorithms helper
    private int calculateContentScore(String platform, double ctr, int avdSeconds, Random rand) {
        int base = 60;
        if (platform.equalsIgnoreCase("YouTube")) {
            int ctrPill = (int) (ctr * 8); // 8% CTR -> 64 points
            int avdPill = (avdSeconds * 100) / 600; // 5m avd -> 50 points
            base = (ctrPill + avdPill) / 2 + 10;
        } else if (platform.equalsIgnoreCase("TikTok") || platform.equalsIgnoreCase("Instagram")) {
            base = (avdSeconds * 100) / 30 + 20; // 20s avd -> 86 points
        } else {
            base = (int) (ctr * 12) + 20;
        }
        return Math.min(100, Math.max(30, base + rand.nextInt(10)));
    }

    private int calculateEngagementScore(String platform, long views, long subscribers, Random rand) {
        int base = 65;
        if (views > 0 && subscribers > 0) {
            double ratio = (double) views / subscribers;
            if (ratio > 10.0) base += 20;
            else if (ratio > 3.0) base += 10;
        }
        return Math.min(100, Math.max(35, base + rand.nextInt(15)));
    }

    private int calculateConsistencyScore(int weeklyUploads, Random rand) {
        int base;
        if (weeklyUploads >= 5) {
            base = 95;
        } else if (weeklyUploads >= 3) {
            base = 85;
        } else if (weeklyUploads >= 1) {
            base = 70;
        } else {
            base = 40;
        }
        return Math.min(100, Math.max(20, base + rand.nextInt(8)));
    }

    private int calculateAudienceScore(long subscribers, Random rand) {
        int base = 50;
        if (subscribers > 50000L) {
            base += 35;
        } else if (subscribers > 10000L) {
            base += 20;
        } else if (subscribers > 2000L) {
            base += 10;
        }
        return Math.min(100, Math.max(30, base + rand.nextInt(15)));
    }

    private String generateNarrativeSummary(String niche, String platform, int overallScore, int contentScore, int consistencyScore) {
        String level = "stable";
        if (overallScore >= 80) {
            level = "exceptional";
        } else if (overallScore < 60) {
            level = "needs attention";
        }

        String nicheName = (niche != null && !niche.trim().isEmpty()) ? niche : "general creator content";
        
        StringBuilder summary = new StringBuilder();
        summary.append(String.format("Your channel performance inside the %s niche on %s is currently %s with an overall score of %d/100. ", 
                nicheName, platform, level, overallScore));

        if (contentScore < 70) {
            summary.append("Your primary bottleneck is Content retention. Audiences are dropping off shortly after clicking, suggesting a mismatch between your titles/thumbnails and the video hooks. ");
        } else {
            summary.append("Your content retention is strong, indicating your current viewers find the videos highly engaging. ");
        }

        if (consistencyScore < 70) {
            summary.append("Furthermore, your upload frequency is inconsistent. Expanding your content pipeline will encourage the platform algorithms to recommend your backlog videos.");
        } else {
            summary.append("Maintaining your consistent upload structure will support long-term compounding growth.");
        }

        return summary.toString();
    }

    private GrowthAuditDto mapToDto(GrowthAudit audit) {
        List<GrowthRecommendationDto> recs = audit.getRecommendations().stream()
                .map(r -> GrowthRecommendationDto.builder()
                        .id(r.getId())
                        .title(r.getTitle())
                        .description(r.getDescription())
                        .impact(r.getImpact())
                        .category(r.getCategory())
                        .status(r.getStatus())
                        .build())
                .collect(Collectors.toList());

        return GrowthAuditDto.builder()
                .id(audit.getId())
                .workspaceId(audit.getWorkspace().getId())
                .growthScore(audit.getGrowthScore())
                .contentScore(audit.getContentScore())
                .engagementScore(audit.getEngagementScore())
                .consistencyScore(audit.getConsistencyScore())
                .audienceScore(audit.getAudienceScore())
                .summary(audit.getSummary())
                .views(audit.getViews())
                .subscribers(audit.getSubscribers())
                .ctr(audit.getCtr())
                .avdSeconds(audit.getAvdSeconds())
                .weeklyUploads(audit.getWeeklyUploads())
                .strengths(audit.getStrengths())
                .weaknesses(audit.getWeaknesses())
                .recommendations(recs)
                .createdAt(audit.getCreatedAt())
                .build();
    }
}
