package com.creatoros.api.service;

import com.creatoros.api.dto.GeneratedContent;
import com.creatoros.api.model.CreatorProfile;

public interface ContentGenerationProvider {
    GeneratedContent generateContent(CreatorProfile profile, String topic, String primaryGoal);
}
