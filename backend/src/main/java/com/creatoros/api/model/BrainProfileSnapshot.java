package com.creatoros.api.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "brain_profile_snapshots", indexes = {
    @Index(name = "idx_brain_snapshot_workspace", columnList = "workspace_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BrainProfileSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "snapshot_id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(nullable = false)
    private int version;

    @Column(name = "creator_identity", columnDefinition = "text")
    private String creatorIdentity;

    @Column(name = "audience_profile", columnDefinition = "text")
    private String audienceProfile;

    @Column(name = "communication_style", columnDefinition = "text")
    private String communicationStyle;

    @Column(name = "writing_style", columnDefinition = "text")
    private String writingStyle;

    @Column(name = "niche", columnDefinition = "text")
    private String niche;

    @Column(name = "content_pillars", columnDefinition = "text")
    private String contentPillars;

    @Column(name = "long_term_goals", columnDefinition = "text")
    private String longTermGoals;

    @Column(name = "extracted_creator_dna", columnDefinition = "text")
    private String extractedCreatorDNA;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }
}
