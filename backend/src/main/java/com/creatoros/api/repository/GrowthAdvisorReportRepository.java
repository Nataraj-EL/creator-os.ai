package com.creatoros.api.repository;

import com.creatoros.api.model.GrowthAdvisorReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GrowthAdvisorReportRepository extends JpaRepository<GrowthAdvisorReport, UUID> {
    List<GrowthAdvisorReport> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);
}
