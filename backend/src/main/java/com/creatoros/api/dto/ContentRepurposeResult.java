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
public class ContentRepurposeResult {
    private String title;
    private String content;
    private List<String> suggestedHashtags;
    private String suggestedCTA;
}
