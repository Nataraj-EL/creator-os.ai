package com.creatoros.api.dto;

import lombok.Builder;
import lombok.Value;
import java.util.List;

@Value
@Builder
public class GeneratedContent {
    List<String> hooks;
    String script;
    List<String> ctas;
}
