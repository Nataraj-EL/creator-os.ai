package com.creatoros.api.dto;

import com.creatoros.api.model.KnowledgeStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeDocumentResponse {
    private UUID documentId;
    private KnowledgeStatus status;
}
