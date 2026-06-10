package com.creatoros.api.service;

import com.creatoros.api.dto.*;
import com.creatoros.api.model.*;
import com.creatoros.api.repository.GrowthAdvisorReportRepository;
import com.creatoros.api.repository.WorkspaceRepository;
import com.creatoros.api.repository.BrainProfileRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GrowthAdvisorService {

    private static final Logger log = LoggerFactory.getLogger(GrowthAdvisorService.class);

    private final GrowthAdvisorReportRepository growthAdvisorReportRepository;
    private final WorkspaceRepository workspaceRepository;
    private final AiProviderRouter aiProviderRouter;
    private final ObjectMapper objectMapper;
    private final BrainProfileRepository brainProfileRepository;

    @Transactional
    public GrowthAdvisorReportDto analyzeProfile(User creator, UUID workspaceId, GrowthAdvisorRequest request) {
        Workspace workspace = workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        String profileUrl = request.getProfileUrl().trim();
        String niche = request.getNiche();

        // Platform detection and handle extraction
        String platform;
        String handle = "@creator";
        if (profileUrl.contains("youtube.com") || profileUrl.contains("youtu.be")) {
            platform = "YOUTUBE";
            handle = extractYoutubeHandle(profileUrl);
        } else if (profileUrl.contains("instagram.com")) {
            platform = "INSTAGRAM";
            handle = extractInstagramUsername(profileUrl);
        } else {
            throw new IllegalArgumentException("Invalid URL. Only YouTube channel or Instagram profile URLs are supported.");
        }

        // Run scraper or fallback to profile-only
        ChannelMetadata metadata = scrapeProfile(profileUrl, platform, handle);

        GrowthAdvisorInput.GrowthAdvisorInputBuilder inputBuilder = GrowthAdvisorInput.builder()
                .profileUrl(profileUrl)
                .platform(platform)
                .niche(niche)
                .metadata(metadata);

        brainProfileRepository.findByWorkspaceId(workspaceId).ifPresent(brain -> {
            inputBuilder.creatorIdentity(brain.getCreatorIdentity())
                    .audienceProfile(brain.getAudienceProfile())
                    .contentPillars(brain.getContentPillars())
                    .strategicFocus(brain.getStrategicFocus())
                    .longTermGoals(brain.getLongTermGoals());
        });

        GrowthAdvisorInput input = inputBuilder.build();

        // Execute AI task
        GrowthAdvisorResult result = aiProviderRouter.executeWithFallback(
                AiTaskType.GROWTH_ADVISOR,
                input,
                GrowthAdvisorResult.class
        );

        // Save report to database
        String reportJson;
        try {
            reportJson = objectMapper.writeValueAsString(result);
        } catch (IOException e) {
            throw new RuntimeException("Failed to serialize growth advisor report result", e);
        }

        GrowthAdvisorReport reportEntity = GrowthAdvisorReport.builder()
                .workspace(workspace)
                .platform(platform)
                .profileUrl(profileUrl)
                .niche(niche)
                .report(reportJson)
                .build();

        GrowthAdvisorReport saved = growthAdvisorReportRepository.save(reportEntity);
        return mapToDto(saved);
    }

    @Transactional(readOnly = true)
    public List<GrowthAdvisorReportDto> listReports(User creator, UUID workspaceId) {
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        return growthAdvisorReportRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public GrowthAdvisorReportDto getReport(User creator, UUID workspaceId, UUID reportId) {
        workspaceRepository.findByIdAndCreatorId(workspaceId, creator.getId())
                .orElseThrow(() -> new IllegalArgumentException("Workspace not found or unauthorized"));

        GrowthAdvisorReport report = growthAdvisorReportRepository.findById(reportId)
                .orElseThrow(() -> new IllegalArgumentException("Growth Advisor Report not found"));

        if (!report.getWorkspace().getId().equals(workspaceId)) {
            throw new IllegalArgumentException("Unauthorized to access this report");
        }

        return mapToDto(report);
    }

    private ChannelMetadata scrapeProfile(String url, String platform, String handle) {
        log.info("[Scraper] Attempting public data extraction for {} URL: {}", platform, url);
        String html = fetchHtml(url);

        if (html == null || html.trim().isEmpty() || html.contains("login") || html.contains("sign in")) {
            log.warn("[Scraper] Public data scrape failed or login wall detected. Falling back to PROFILE_ONLY mode.");
            return ChannelMetadata.builder()
                    .platform(platform)
                    .handle(handle)
                    .title(handle.replace("@", ""))
                    .description("Profile analysis mode only. Detailed public metrics are unavailable.")
                    .analysisMode("PROFILE_ONLY")
                    .build();
        }

        try {
            String title = extractMetaTag(html, "og:title");
            String description = extractMetaTag(html, "og:description");

            if (title == null || title.trim().isEmpty()) {
                title = handle.replace("@", "");
            }

            // Extract numeric statistics if available (e.g. subscriber counts from description tags)
            Long subs = null;
            Long videos = null;
            Long followers = null;

            if (platform.equals("YOUTUBE")) {
                subs = parseYoutubeSubs(description);
                videos = parseYoutubeVideos(description);
            } else {
                followers = parseInstagramFollowers(description);
            }

            return ChannelMetadata.builder()
                    .platform(platform)
                    .handle(handle)
                    .title(title)
                    .description(description != null ? description : "Public profile page content.")
                    .subscriberCount(subs)
                    .videoCount(videos)
                    .followers(followers)
                    .analysisMode("PUBLIC_DATA")
                    .build();

        } catch (Exception e) {
            log.error("[Scraper] Parsing failed, using PROFILE_ONLY fallback: {}", e.getMessage());
            return ChannelMetadata.builder()
                    .platform(platform)
                    .handle(handle)
                    .title(handle.replace("@", ""))
                    .description("Profile analysis mode only. Detailed public metrics are unavailable due to parsing issues.")
                    .analysisMode("PROFILE_ONLY")
                    .build();
        }
    }

    private String fetchHtml(String url) {
        try {
            SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
            factory.setConnectTimeout(4000);
            factory.setReadTimeout(4000);
            RestClient client = RestClient.builder().requestFactory(factory).build();
            return client.get()
                    .uri(url)
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36")
                    .retrieve()
                    .body(String.class);
        } catch (Exception e) {
            log.warn("[Scraper] Outbound connection to {} failed: {}", url, e.getMessage());
            return null;
        }
    }

    private String extractMetaTag(String html, String propertyValue) {
        try {
            Pattern p1 = Pattern.compile("<meta[^>]+(?:property|name)=\"" + Pattern.quote(propertyValue) + "\"[^>]+content=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE);
            Matcher m1 = p1.matcher(html);
            if (m1.find()) {
                return m1.group(1);
            }
            Pattern p2 = Pattern.compile("<meta[^>]+content=\"([^\"]+)\"[^>]+(?:property|name)=\"" + Pattern.quote(propertyValue) + "\"", Pattern.CASE_INSENSITIVE);
            Matcher m2 = p2.matcher(html);
            if (m2.find()) {
                return m2.group(1);
            }
        } catch (Exception e) {
            // ignore
        }
        return null;
    }

    private String extractYoutubeHandle(String url) {
        // e.g. https://youtube.com/@mrbeast -> @mrbeast
        Pattern p = Pattern.compile("youtube\\.com/(@[a-zA-Z0-9_.-]+)");
        Matcher m = p.matcher(url);
        if (m.find()) {
            return m.group(1);
        }
        // channel id fallback
        Pattern p2 = Pattern.compile("youtube\\.com/channel/([a-zA-Z0-9_-]+)");
        Matcher m2 = p2.matcher(url);
        if (m2.find()) {
            return "@channel_" + m2.group(1).substring(0, Math.min(8, m2.group(1).length()));
        }
        return "@youtube_creator";
    }

    private String extractInstagramUsername(String url) {
        // e.g. https://instagram.com/mrbeast/ -> @mrbeast
        Pattern p = Pattern.compile("instagram\\.com/([a-zA-Z0-9_.-]+)");
        Matcher m = p.matcher(url);
        if (m.find()) {
            return "@" + m.group(1);
        }
        return "@instagram_creator";
    }

    private Long parseYoutubeSubs(String description) {
        if (description == null) return null;
        // e.g. "120M subscribers" or "500K subscribers" or "10,500 subscribers"
        try {
            Pattern p = Pattern.compile("([0-9.,]+)([KMB]?)\\s+subscribers", Pattern.CASE_INSENSITIVE);
            Matcher m = p.matcher(description);
            if (m.find()) {
                String valStr = m.group(1).replace(",", "");
                double val = Double.parseDouble(valStr);
                String scale = m.group(2).toUpperCase();
                if (scale.equals("K")) val *= 1_000;
                else if (scale.equals("M")) val *= 1_000_000;
                else if (scale.equals("B")) val *= 1_000_000_000;
                return (long) val;
            }
        } catch (Exception e) {
            // ignore
        }
        return null;
    }

    private Long parseYoutubeVideos(String description) {
        if (description == null) return null;
        try {
            Pattern p = Pattern.compile("([0-9.,]+)\\s+videos", Pattern.CASE_INSENSITIVE);
            Matcher m = p.matcher(description);
            if (m.find()) {
                return Long.parseLong(m.group(1).replace(",", ""));
            }
        } catch (Exception e) {
            // ignore
        }
        return null;
    }

    private Long parseInstagramFollowers(String description) {
        if (description == null) return null;
        // e.g. "12.5M Followers, 500 Following..."
        try {
            Pattern p = Pattern.compile("([0-9.,]+)([KMB]?)\\s+Followers", Pattern.CASE_INSENSITIVE);
            Matcher m = p.matcher(description);
            if (m.find()) {
                String valStr = m.group(1).replace(",", "");
                double val = Double.parseDouble(valStr);
                String scale = m.group(2).toUpperCase();
                if (scale.equals("K")) val *= 1_000;
                else if (scale.equals("M")) val *= 1_000_000;
                else if (scale.equals("B")) val *= 1_000_000_000;
                return (long) val;
            }
        } catch (Exception e) {
            // ignore
        }
        return null;
    }

    private GrowthAdvisorReportDto mapToDto(GrowthAdvisorReport r) {
        GrowthAdvisorResult parsedReport;
        try {
            parsedReport = objectMapper.readValue(r.getReport(), GrowthAdvisorResult.class);
        } catch (IOException e) {
            throw new RuntimeException("Failed to deserialize saved report result in DB", e);
        }

        return GrowthAdvisorReportDto.builder()
                .id(r.getId())
                .workspaceId(r.getWorkspace().getId())
                .platform(r.getPlatform())
                .profileUrl(r.getProfileUrl())
                .niche(r.getNiche())
                .report(parsedReport)
                .createdAt(r.getCreatedAt())
                .build();
    }
}
