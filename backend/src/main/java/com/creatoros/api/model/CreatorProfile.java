package com.creatoros.api.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "creator_profiles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreatorProfile {

    @Id
    @Column(name = "workspace_id")
    private UUID workspaceId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "workspace_id")
    private Workspace workspace;

    @Column(name = "creator_name")
    private String creatorName;

    private String niche;

    @Column(name = "primary_platform")
    private String primaryPlatform;

    @Column(name = "target_audience", columnDefinition = "TEXT")
    private String targetAudience;

    @Column(name = "content_style", columnDefinition = "TEXT")
    private String contentStyle;

    @Column(name = "brand_voice", columnDefinition = "TEXT")
    private String brandVoice;

    @Column(name = "growth_goal", columnDefinition = "TEXT")
    private String growthGoal;

    @Column(name = "posting_frequency")
    private String postingFrequency;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        updatedAt = Instant.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
