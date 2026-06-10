package com.creatoros.api.repository;

import com.creatoros.api.model.KnowledgeDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface KnowledgeDocumentRepository extends JpaRepository<KnowledgeDocument, UUID> {
    List<KnowledgeDocument> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);
    Optional<KnowledgeDocument> findByIdAndWorkspaceId(UUID id, UUID workspaceId);
}
