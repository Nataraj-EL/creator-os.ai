package com.creatoros.api.repository;

import com.creatoros.api.model.ReelAnalysis;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ReelAnalysisRepository extends JpaRepository<ReelAnalysis, UUID> {
    List<ReelAnalysis> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);
    Optional<ReelAnalysis> findByIdAndWorkspaceId(UUID id, UUID workspaceId);
}
