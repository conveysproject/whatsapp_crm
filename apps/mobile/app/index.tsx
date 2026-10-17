import { useAuth } from "../lib/auth";
import { Redirect } from "expo-router";

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  return <Redirect href={isSignedIn ? "/inbox" : "/sign-in"} />;
}
