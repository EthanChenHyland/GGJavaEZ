# Gradle wrapper fixture provenance

- Gradle version: 9.4.1.
- `gradle-wrapper.jar` source: `gradle/gradle` official Git tag `v9.4.1`, path `gradle/wrapper/gradle-wrapper.jar`.
- JAR SHA-256: `55243ef57851f12b070ad14f7f5bb8302daceeebc5bce5ece5fa6edb23e1145c`, checked against `https://services.gradle.org/distributions/gradle-9.4.1-wrapper.jar.sha256`.
- Gradle distribution SHA-256: `2ab2958f2a1e51120c326cad6f385153bb11ee93b3c216c5fccebfdfbb7ec6cb`, checked against the official distribution checksum.
- License: Apache License 2.0, included as `LICENSE` beside this file. The fixture launcher script is a small compatible entry point authored for this repository.

The wrapper downloads the pinned distribution only if it is absent from `GRADLE_USER_HOME/wrapper/dists`. Keep `GRADLE_USER_HOME` stable during serialized QA so the distribution is cached once.
