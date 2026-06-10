package com.creatoros.api.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "growth_advisor_reports", indexes = {
    @Index(name = "idx_growth_advisor_workspace", columnList = "workspace_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GrowthAdvisorReport {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "report_id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(nullable = false)
    private String platform;

    @Column(name = "profile_url", nullable = false)
    private String profileUrl;

    @Column(nullable = true)
    private String niche;

    @Column(columnDefinition = "TEXT")
    private String report; // Serialized JSON string of GrowthAdvisorResult

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }
}
