package com.creatoros.api.dto;

import lombok.Builder;
import lombok.Value;
import java.util.List;

@Value
@Builder
public class ReelAnalysisResult {
    int durationSeconds;
    int hookScore;
    int retentionScore;
    int ctaScore;
    int contentScore;
    int overallScore;
    List<String> strengths;
    List<String> weaknesses;
    List<String> recommendations;
    String captionAnalysis;
    String ctaAnalysis;
    String retentionPrediction;
    String viralPotential;
    String hookAnalysis;
}
