package com.creatoros.api.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "growth_audits")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GrowthAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "audit_id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(name = "growth_score", nullable = false)
    private int growthScore;

    @Column(name = "content_score", nullable = false)
    private int contentScore;

    @Column(name = "engagement_score", nullable = false)
    private int engagementScore;

    @Column(name = "consistency_score", nullable = false)
    private int consistencyScore;

    @Column(name = "audience_score", nullable = false)
    private int audienceScore;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String summary;

    // Metrics Snapshot
    private Long views;
    private Long subscribers;
    private Double ctr;
    private Integer avdSeconds;
    private Integer weeklyUploads;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "growth_audit_strengths", joinColumns = @JoinColumn(name = "audit_id"))
    @Column(name = "strength", length = 500, nullable = false)
    @Builder.Default
    private List<String> strengths = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "growth_audit_weaknesses", joinColumns = @JoinColumn(name = "audit_id"))
    @Column(name = "weakness", length = 500, nullable = false)
    @Builder.Default
    private List<String> weaknesses = new ArrayList<>();

    @OneToMany(mappedBy = "audit", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private List<GrowthRecommendation> recommendations = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }
}
