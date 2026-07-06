package com.creatoros.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ContentRepurposeRequest {
    @NotBlank(message = "Original content is required")
    private String originalContent;
    
    @NotNull(message = "Source type is required")
    private SourceType sourceType;
    
    @NotNull(message = "Target format is required")
    private TargetFormat targetFormat;
}
