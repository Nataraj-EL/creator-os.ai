package com.creatoros.api.dto;

import lombok.Builder;
import lombok.Value;
import java.util.List;
import java.util.UUID;

@Value
@Builder
public class KnowledgeSearchResult {
    List<Match> matches;

    @Value
    @Builder
    public static class Match {
        UUID documentId;
        String fileName;
        String excerpt;
        double relevanceScore;
    }
}
