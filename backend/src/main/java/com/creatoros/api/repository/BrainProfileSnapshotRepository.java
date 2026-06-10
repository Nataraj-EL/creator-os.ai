package com.creatoros.api.repository;

import com.creatoros.api.model.BrainProfileSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface BrainProfileSnapshotRepository extends JpaRepository<BrainProfileSnapshot, UUID> {
    List<BrainProfileSnapshot> findByWorkspaceIdOrderByVersionDesc(UUID workspaceId);
}
