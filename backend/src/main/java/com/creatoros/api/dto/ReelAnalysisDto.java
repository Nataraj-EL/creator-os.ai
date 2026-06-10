package com.creatoros.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReelAnalysisDto {
    private UUID analysisId;
    private UUID workspaceId;
    private String title;
    private String originalFilename;
    private int durationSeconds;
    private int hookScore;
    private int retentionScore;
    private int ctaScore;
    private int contentScore;
    private int overallScore;
    private String reelUrl;
    private String captionAnalysis;
    private String ctaAnalysis;
    private String retentionPrediction;
    private String viralPotential;
    private String hookAnalysis;
    private List<String> strengths;
    private List<String> weaknesses;
    private List<String> recommendations;
    private Instant createdAt;
}
