import { Redirect } from "expo-router";
export default function ManagementIndex() { return <Redirect href={{ pathname: "/manage/[section]", params: { section: "dashboard" } }} />; }
