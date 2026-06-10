package com.creatoros.api.repository;

import com.creatoros.api.model.ContentProject;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ContentProjectRepository extends JpaRepository<ContentProject, UUID> {
    List<ContentProject> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);
    Optional<ContentProject> findByIdAndWorkspaceId(UUID id, UUID workspaceId);
}
