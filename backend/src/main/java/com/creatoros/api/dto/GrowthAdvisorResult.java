package com.creatoros.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GrowthAdvisorResult {
    private String profileSummary;
    private List<String> strengths;
    private List<String> weaknesses;
    private List<String> opportunities;
    private List<String> contentGaps;
    private List<String> recommendations;
    private String growthRoadmap;
}
