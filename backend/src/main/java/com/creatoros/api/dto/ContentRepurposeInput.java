package com.creatoros.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ContentRepurposeInput {
    private String originalContent;
    private SourceType sourceType;
    private TargetFormat targetFormat;
}
