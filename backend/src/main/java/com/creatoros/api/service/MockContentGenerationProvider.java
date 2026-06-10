package com.creatoros.api.service;

import com.creatoros.api.dto.GeneratedContent;
import com.creatoros.api.model.CreatorProfile;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

@Service
public class MockContentGenerationProvider implements ContentGenerationProvider {

    @Override
    public GeneratedContent generateContent(CreatorProfile profile, String topic, String primaryGoal) {
        String seedString = topic.trim().toLowerCase()
                + (profile != null && profile.getCreatorName() != null ? profile.getCreatorName() : "")
                + (profile != null && profile.getNiche() != null ? profile.getNiche() : "")
                + (profile != null && profile.getPrimaryPlatform() != null ? profile.getPrimaryPlatform() : "")
                + (primaryGoal != null ? primaryGoal : "");
        long seed = seedString.hashCode();
        Random rand = new Random(seed);

        String platform = (profile != null && profile.getPrimaryPlatform() != null) ? profile.getPrimaryPlatform() : "YouTube";
        String voice = (profile != null && profile.getBrandVoice() != null) ? profile.getBrandVoice().toLowerCase() : "informative";
        String niche = (profile != null && profile.getNiche() != null) ? profile.getNiche() : "content creation";

        List<String> hooks = new ArrayList<>();
        String script;
        List<String> ctas = new ArrayList<>();

        // Add context keywords to simulate real AI analysis
        String voicePrefix = "";
        String voiceJoke = "";
        if (voice.contains("humor") || voice.contains("witty")) {
            voicePrefix = "Spoiler alert: ";
            voiceJoke = " (unless you enjoy crying over compiler logs at 3 AM) ";
        } else if (voice.contains("technical") || voice.contains("analytical")) {
            voicePrefix = "Based on metric evaluations: ";
            voiceJoke = " within O(1) complexity bounds ";
        }

        String goal = primaryGoal != null ? primaryGoal.trim() : "";

        // 1. Generate Hooks based on goal
        if (goal.equalsIgnoreCase("Reach")) {
            hooks.add(String.format("%sThis viral secret about %s will double your views!", voicePrefix, topic));
            hooks.add(String.format("The absolute craziest thing about %s. You won't believe this.%s", topic, voiceJoke));
            hooks.add(String.format("Stop scrolling if you want to scale %s in seconds!", topic));
        } else if (goal.equalsIgnoreCase("Engagement")) {
            hooks.add(String.format("%sIs this the worst way to learn %s? Let's discuss.", voicePrefix, topic));
            hooks.add(String.format("I tried learning %s so you don't have to... but what do you think?%s", topic, voiceJoke));
            hooks.add(String.format("Tell me I'm wrong, but %s is highly overrated. Here's why.", topic));
        } else if (goal.equalsIgnoreCase("Lead Generation")) {
            hooks.add(String.format("%sAre you struggling with %s? Here is the exact checklist you need.", voicePrefix, topic));
            hooks.add(String.format("Stop wasting hours on %s. Get this free framework instead.%s", topic, voiceJoke));
            hooks.add(String.format("Want to build %s step-by-step? I have a free guide.", topic));
        } else if (goal.equalsIgnoreCase("Sales / Conversion") || goal.equalsIgnoreCase("Sales")) {
            hooks.add(String.format("%sHow I scaled my brand using this %s system.", voicePrefix, topic));
            hooks.add(String.format("Why %s is the best investment you will make this week.%s", topic, voiceJoke));
            hooks.add(String.format("If you're not using this %s strategy, you're losing money.", topic));
        } else if (goal.equalsIgnoreCase("Community Building")) {
            hooks.add(String.format("%sJoin 10k other creators who are building %s together.", voicePrefix, topic));
            hooks.add(String.format("Here is what our creator community learned about %s.%s", topic, voiceJoke));
            hooks.add(String.format("We need to talk about how we collaborate on %s.", topic));
        } else if (goal.equalsIgnoreCase("Authority Building")) {
            hooks.add(String.format("%sThe industry standard framework for %s.", voicePrefix, topic));
            hooks.add(String.format("Here is the exact method I use to advise six-figure brands on %s.%s", topic, voiceJoke));
            hooks.add(String.format("The scientific breakdown of how %s actually works.", topic));
        } else {
            // Default
            hooks.add(String.format("%sMost people waste months learning %s the wrong way. Here is the 3-part guide.", voicePrefix, topic));
            hooks.add(String.format("AI is changing how we do %s. Here is how to keep up.%s", topic, voiceJoke));
            hooks.add(String.format("I tried every method for %s. This is the only one that actually worked.", topic));
        }

        // 2. Generate 1 Script (structured in 3 parts, influenced by goal)
        String scriptAngle = "baseline structure";
        if (goal.equalsIgnoreCase("Reach")) {
            scriptAngle = "high visual hook pacing and rapid editing templates";
        } else if (goal.equalsIgnoreCase("Engagement")) {
            scriptAngle = "audience conversation starters and direct question overlays";
        } else if (goal.equalsIgnoreCase("Lead Generation")) {
            scriptAngle = "identifying core paint points and introducing a downloadable solution";
        } else if (goal.equalsIgnoreCase("Sales / Conversion") || goal.equalsIgnoreCase("Sales")) {
            scriptAngle = "handling primary user objections and presenting a clear conversion offer";
        } else if (goal.equalsIgnoreCase("Community Building")) {
            scriptAngle = "sharing community experiences and inviting collaboration";
        } else if (goal.equalsIgnoreCase("Authority Building")) {
            scriptAngle = "detailing industry case studies and high-credibility frameworks";
        }

        script = String.format(
                "Part 1: The Context Setup.\n" +
                "Welcome back! If you are aiming to build a brand in the '%s' niche, you must master '%s'. " +
                "Most creators start with complicated setups, but the secret is starting with clean, repeatable systems.\n\n" +
                "Part 2: The Core Strategy.\n" +
                "First, define your specific viewer pain point. Second, establish a baseline structure. " +
                "For %s, this means focus on %s. Let's optimize this step by step%s.\n\n" +
                "Part 3: The Iteration.\n" +
                "Finally, look at the analytics curves. Don't guess what works; let viewer behavior dictate your next content cycle.",
                niche, topic, topic, scriptAngle, voiceJoke
        );

        // 3. Generate CTAs based on goal
        if (goal.equalsIgnoreCase("Reach")) {
            ctas.add("Share this video with a creator friend!");
            ctas.add("Save this post for your next project session!");
        } else if (goal.equalsIgnoreCase("Engagement")) {
            ctas.add("Let me know your thoughts in the comments below!");
            ctas.add("Which tip was your favorite? Drop your opinion!");
        } else if (goal.equalsIgnoreCase("Lead Generation")) {
            ctas.add(String.format("Grab my free %s blueprint template at the link in bio!", topic));
            ctas.add("Comment 'GUIDE' below and I will DM you the link!");
        } else if (goal.equalsIgnoreCase("Sales / Conversion") || goal.equalsIgnoreCase("Sales")) {
            ctas.add("Click the link in my bio to enroll in the masterclass today!");
            ctas.add("Get the complete guide now and start scaling!");
        } else if (goal.equalsIgnoreCase("Community Building")) {
            ctas.add("Join our free Discord community using the link in bio!");
            ctas.add("Welcome to the community, subscribe to stay connected!");
        } else if (goal.equalsIgnoreCase("Authority Building")) {
            ctas.add(String.format("Follow for daily expert-level %s strategies.", niche));
            ctas.add("Read the full case study outline linked in my bio.");
        } else {
            if (platform.equalsIgnoreCase("TikTok") || platform.equalsIgnoreCase("Instagram")) {
                ctas.add(String.format("Double tap and follow for daily %s hacks!", niche));
                ctas.add(String.format("Check my link in bio to get my free %s resource template.", topic));
            } else {
                ctas.add(String.format("Subscribe for more practical %s growth strategies.", niche));
                ctas.add(String.format("Grab my free %s blueprint sheet using the link in description.", topic));
            }
        }

        return GeneratedContent.builder()
                .hooks(hooks)
                .script(script)
                .ctas(ctas)
                .build();
    }
}
