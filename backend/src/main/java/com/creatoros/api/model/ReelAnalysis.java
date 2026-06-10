package com.creatoros.api.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "reel_analyses", indexes = {
    @Index(name = "idx_reel_analysis_workspace", columnList = "workspace_id")
})
@SQLRestriction("deleted = false")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReelAnalysis {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "analysis_id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(nullable = false)
    private String title;

    @Column(name = "original_filename")
    private String originalFilename;

    @Column(name = "duration_seconds", nullable = false)
    private int durationSeconds;

    @Column(name = "hook_score", nullable = false)
    private int hookScore;

    @Column(name = "retention_score", nullable = false)
    private int retentionScore;

    @Column(name = "cta_score", nullable = false)
    private int ctaScore;

    @Column(name = "content_score", nullable = false)
    private int contentScore;

    @Column(name = "overall_score", nullable = false)
    private int overallScore;

    @Column(name = "reel_url")
    private String reelUrl;

    @Column(name = "caption_analysis", columnDefinition = "TEXT")
    private String captionAnalysis;

    @Column(name = "cta_analysis", columnDefinition = "TEXT")
    private String ctaAnalysis;

    @Column(name = "retention_prediction", columnDefinition = "TEXT")
    private String retentionPrediction;

    @Column(name = "viral_potential", columnDefinition = "TEXT")
    private String viralPotential;

    @Column(name = "hook_analysis", columnDefinition = "TEXT")
    private String hookAnalysis;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private List<String> strengths = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private List<String> weaknesses = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private List<String> recommendations = new ArrayList<>();

    @Column(nullable = false)
    @Builder.Default
    private boolean deleted = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }
}
