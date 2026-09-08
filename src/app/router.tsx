import { createBrowserRouter, Outlet } from "react-router";
import { listRulesets } from "../core/storage/rulesetStorage";
import { rulesetLoader } from "../features/editor/rulesetLoader";
import { AppLayout } from "./AppLayout";
import { MainMenu } from "./MainMenu";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [{ index: true, loader: () => listRulesets(), element: <MainMenu /> }],
  },
  {
    path: "editor/:rulesetId",
    loader: rulesetLoader,
    element: <Outlet />,
    children: [
      {
        path: "list-building",
        lazy: async () => {
          const { ListBuildingLayout } =
            await import("../features/list-builder/ListBuildingLayout");
          return { Component: ListBuildingLayout };
        },
        children: [
          {
            index: true,
            lazy: async () => {
              const { ListBuildingHome } =
                await import("../features/list-builder/ListBuildingHome");
              return { Component: ListBuildingHome };
            },
          },
          {
            path: "resources",
            handle: { crumb: "Resources" },
            lazy: async () => {
              const { ResourcesPage } = await import("../features/list-builder/ResourcesPage");
              return { Component: ResourcesPage };
            },
          },
          {
            path: "formats",
            handle: { crumb: "Formats" },
            lazy: async () => {
              const { FormatsPage } = await import("../features/list-builder/FormatsPage");
              return { Component: FormatsPage };
            },
          },
          {
            path: "categories",
            handle: { crumb: "Categories" },
            lazy: async () => {
              const { CategoriesPage } = await import("../features/list-builder/CategoriesPage");
              return { Component: CategoriesPage };
            },
          },
          {
            path: "categories/:categoryId",
            lazy: async () => {
              const { CategoryTablePage } =
                await import("../features/list-builder/CategoryTablePage");
              return { Component: CategoryTablePage };
            },
          },
          {
            path: "categories/:categoryId/fields",
            handle: { crumb: "Fields & constraints" },
            lazy: async () => {
              const { CategoryEditorPage } =
                await import("../features/list-builder/CategoryEditorPage");
              return { Component: CategoryEditorPage };
            },
          },
          {
            path: "categories/:categoryId/nodes/:nodeId",
            lazy: async () => {
              const { InstanceEditorPage } =
                await import("../features/list-builder/InstanceEditorPage");
              return { Component: InstanceEditorPage };
            },
          },
          {
            path: "categories/:categoryId/records/:recordId",
            lazy: async () => {
              const { InstanceEditorPage } =
                await import("../features/list-builder/InstanceEditorPage");
              return { Component: InstanceEditorPage };
            },
          },
        ],
      },
      {
        path: "keyword/:keywordId",
        lazy: async () => {
          const { KeywordEditorPage } = await import("../features/editor/KeywordEditorPage");
          return { Component: KeywordEditorPage };
        },
      },
      {
        path: ":articleId?",
        lazy: async () => {
          const { EditorPage } = await import("../features/editor/EditorPage");
          return { Component: EditorPage };
        },
      },
    ],
  },
]);
