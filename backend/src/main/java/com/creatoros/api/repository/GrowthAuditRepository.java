package com.creatoros.api.repository;

import com.creatoros.api.model.GrowthAudit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GrowthAuditRepository extends JpaRepository<GrowthAudit, UUID> {
    List<GrowthAudit> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);
    Optional<GrowthAudit> findFirstByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);
}
