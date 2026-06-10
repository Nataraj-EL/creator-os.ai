package com.creatoros.api.repository;

import com.creatoros.api.model.ContentVariant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface ContentVariantRepository extends JpaRepository<ContentVariant, UUID> {
}
