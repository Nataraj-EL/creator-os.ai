package com.creatoros.api.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GrowthAdvisorRequest {
    @NotBlank(message = "Profile URL is required")
    private String profileUrl;
    private String niche;
}
