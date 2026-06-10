package com.creatoros.api.repository;

import com.creatoros.api.model.Workspace;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {
    List<Workspace> findByCreatorId(UUID creatorId);
    Optional<Workspace> findByIdAndCreatorId(UUID id, UUID creatorId);
    boolean existsByCreatorIdAndName(UUID creatorId, String name);
    Optional<Workspace> findBySlug(String slug);
}
