package com.creatoros.api.dto;

import lombok.Builder;
import lombok.Value;
import java.util.List;
import java.util.UUID;

@Value
@Builder
public class KnowledgeSearchInput {
    UUID workspaceId;
    String query;
    List<DocumentCandidate> candidates;

    @Value
    @Builder
    public static class DocumentCandidate {
        UUID documentId;
        String fileName;
        String content;
    }
}
