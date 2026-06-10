package com.creatoros.api.repository;

import com.creatoros.api.model.BrainProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface BrainProfileRepository extends JpaRepository<BrainProfile, UUID> {
    Optional<BrainProfile> findByWorkspaceId(UUID workspaceId);
}
