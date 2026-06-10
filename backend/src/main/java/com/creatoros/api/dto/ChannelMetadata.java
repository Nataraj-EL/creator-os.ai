package com.creatoros.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChannelMetadata {
    private String platform;
    private String handle;
    private String title;
    private String description;
    private Long subscriberCount;
    private Long videoCount;
    private Long followers;
    private String analysisMode; // "PUBLIC_DATA" or "PROFILE_ONLY"
}
