package com.creatoros.api.dto;

import com.creatoros.api.model.KnowledgeStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeDocumentDto {
    private UUID documentId;
    private UUID workspaceId;
    private String fileName;
    private String contentType;
    private Long fileSize;
    private String extractedText;
    private Integer wordCount;
    private Integer characterCount;
    private KnowledgeStatus status;
    private Instant createdAt;
    private Instant updatedAt;
}
