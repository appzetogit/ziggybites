function hasValue(value) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export function getDeliverySignupProgress(delivery) {
  const hasStep1Details =
    hasValue(delivery?.name) &&
    hasValue(delivery?.location?.addressLine1) &&
    hasValue(delivery?.location?.city) &&
    hasValue(delivery?.location?.state) &&
    hasValue(delivery?.vehicle?.number) &&
    hasValue(delivery?.documents?.pan?.number) &&
    hasValue(delivery?.documents?.aadhar?.number);

  const hasStep2Documents =
    hasValue(delivery?.profileImage?.url || delivery?.documents?.photo) &&
    hasValue(delivery?.documents?.aadhar?.document) &&
    hasValue(delivery?.documents?.pan?.document) &&
    hasValue(delivery?.documents?.drivingLicense?.document);

  const signupComplete = hasStep1Details && hasStep2Documents;
  const nextSignupStep = hasStep1Details ? "documents" : "details";

  return {
    hasStep1Details,
    hasStep2Documents,
    signupComplete,
    needsSignup: !signupComplete,
    nextSignupStep,
  };
}

