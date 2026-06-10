package com.creatoros.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GrowthRecommendationDto {
    private UUID id;
    private String title;
    private String description;
    private String impact;
    private String category;
    private String status;
}
