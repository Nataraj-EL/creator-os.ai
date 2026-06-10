package com.creatoros.api.dto;

import lombok.Builder;
import lombok.Value;
import java.util.List;

@Value
@Builder(toBuilder = true)
public class ReelAnalysisInput {
    String fileName;
    long fileSize;
    byte[] fileBytes;
    String visualCaption;
    String reelUrl;
    List<String> framesBase64;
    String caption;

    // Brain Twin Personalization Context
    String creatorIdentity;
    String creatorDNA;
}
