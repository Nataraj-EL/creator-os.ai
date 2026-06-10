package com.creatoros.api.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "brain_profiles", indexes = {
    @Index(name = "idx_brain_workspace", columnList = "workspace_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BrainProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "profile_id", updatable = false, nullable = false)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false, unique = true)
    private Workspace workspace;

    @Column(name = "creator_identity", columnDefinition = "text")
    private String creatorIdentity;

    @Column(name = "creator_mission", columnDefinition = "text")
    private String creatorMission;

    @Column(name = "creator_vision", columnDefinition = "text")
    private String creatorVision;

    @Column(name = "audience_profile", columnDefinition = "text")
    private String audienceProfile;

    @Column(name = "communication_style", columnDefinition = "text")
    private String communicationStyle;

    @Column(name = "writing_style", columnDefinition = "text")
    private String writingStyle;

    @Column(name = "content_style", columnDefinition = "text")
    private String contentStyle;

    @Column(name = "preferred_cta_style", columnDefinition = "text")
    private String preferredCTAStyle;

    @Column(name = "niche", columnDefinition = "text")
    private String niche;

    @Column(name = "strategic_focus", columnDefinition = "text")
    private String strategicFocus;

    @Column(name = "personality_traits", columnDefinition = "text")
    private String personalityTraits;

    @Column(name = "content_pillars", columnDefinition = "text")
    private String contentPillars;

    @Column(name = "expertise_areas", columnDefinition = "text")
    private String expertiseAreas;

    @Column(name = "long_term_goals", columnDefinition = "text")
    private String longTermGoals;

    @Column(name = "extracted_creator_dna", columnDefinition = "text")
    private String extractedCreatorDNA;

    @Column(name = "content_examples", columnDefinition = "text")
    private String contentExamples;

    @Column(name = "document_count", nullable = false)
    @Builder.Default
    private Integer documentCount = 0;

    @Column(name = "total_words_analyzed", nullable = false)
    @Builder.Default
    private Long totalWordsAnalyzed = 0L;

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
