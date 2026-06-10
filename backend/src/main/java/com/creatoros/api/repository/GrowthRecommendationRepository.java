package com.creatoros.api.repository;

import com.creatoros.api.model.GrowthRecommendation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface GrowthRecommendationRepository extends JpaRepository<GrowthRecommendation, UUID> {
}
