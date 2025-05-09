"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTaskModal } from "@/hooks/useTaskModal";
import {
  createTask,
  deleteTask,
  suggestTaskMetadata,
  updateTask,
} from "@/action/tasks-server";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import {
  TaskFormBaseSchema,
  TaskFormSchema,
  taskFormSchema,
} from "@/lib/zod-validations";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "@/lib/utils";
import {
  CalendarIcon,
  Check,
  CircleX,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Calendar } from "./ui/calendar";
import { format } from "date-fns";
import { Badge } from "./ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import SubTaskModal from "./SubTaskModal";
import { CreateTask, Task, UpdateTask } from "@/database/kysely";
import { v4 as uuidv4 } from "uuid";

const availableLabels = [
  "bug",
  "feature",
  "documentation",
  "enhancement",
  "design",
  "testing",
];

export default function TaskModal({ userId }: { userId: string }) {
  const { isOpen, closeModal, task, subTasks, openSubTaskModal } =
    useTaskModal();
  const form = useForm<TaskFormSchema>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "backlog",
      priority: "medium",
      dueDate: null,
      labels: [],
      archived: false,
    },
  });

  const [openDueDatePopover, setOpenDueDatePopover] = useState(false);
  const [openLabelsPopover, setOpenLabelsPopover] = useState(false);
  const [subTaskList, setSubTaskList] = useState<(TaskFormBaseSchema | Task)[]>(
    []
  );
  const [suggestedLabels, setSuggestedLabels] = useState<string[]>([]);

  useEffect(() => {
    if (task) {
      form.setValue("name", task.name);
      form.setValue("description", task.description);
      form.setValue("status", task.status);
      form.setValue("priority", task.priority);
      form.setValue("dueDate", task.dueDate);
      form.setValue("estimatedTime", task.estimatedTime);
      form.setValue("labels", task.labels);
      form.setValue("archived", task.archived || false);
    } else {
      form.reset();
    }
    setSubTaskList(subTasks);
  }, [form, task /* isOpen */]);

  const fetchAISuggestedValues = async () => {
    const name = form.getValues("name");
    const description = form.getValues("description");

    if (!description.trim()) return;

    try {
      const metadata = await suggestTaskMetadata(name, description);
      if (metadata?.tags && metadata?.tags.length > 0) {
        setSuggestedLabels(metadata?.tags);
        const currentLabels = form.getValues("labels");
        const labelsTodAdd: string[] = [];
        metadata?.tags.forEach((label) => {
          if (!currentLabels.includes(label)) {
            labelsTodAdd.push(label);
          }
        });
        form.setValue("labels", [...currentLabels, ...labelsTodAdd]);
      }

      if (metadata?.priority && metadata?.priority !== null) {
        form.setValue("priority", metadata.priority);
      }

      if (metadata?.dueDate && metadata?.dueDate !== null) {
        form.setValue("dueDate", metadata.dueDate);
      }

      if (metadata?.estimatedTime && metadata?.estimatedTime !== null) {
        form.setValue("estimatedTime", metadata.estimatedTime);
      }

      if (metadata?.subtasks && metadata?.subtasks.length > 0) {
        metadata.subtasks.forEach((subTask) => {
          const newSubTask = {
            name: subTask,
            description: "",
            status: "backlog",
            uuid: uuidv4(),
          };
          addSubTask(newSubTask);
        });
      }
    } catch (error) {
      console.error("Failed to fetch suggested labels:", error);
    }
  };

  async function onSubmit(data: TaskFormSchema) {
    if (task) {
      await updateTask({ ...data, uuid: task.uuid });
      for (const subTaskListItem of subTaskList) {
        if ("id" in subTaskListItem) {
          await updateTask(subTaskListItem as UpdateTask);
        } else {
          await createTask({
            ...(subTaskListItem as CreateTask),
            userId,
            parentTaskId: task.id,
          });
        }
      }

      for (const subTask of subTasks) {
        if (!subTaskList.map((st) => st.uuid).includes(subTask.uuid)) {
          await deleteTask(subTask.uuid);
        }
      }
    } else {
      const newTask = await createTask({ ...data, userId });
      for (const subTask of subTaskList as CreateTask[]) {
        await createTask({
          ...subTask,
          userId,
          parentTaskId: newTask?.id,
        });
      }
    }
    form.reset();
    closeModal();
  }

  function addSubTask(data: TaskFormBaseSchema) {
    setSubTaskList((prev) => [...prev, data]);
  }

  function updateSubTask(data: TaskFormBaseSchema) {
    setSubTaskList((prev) =>
      prev.map((subTask) =>
        subTask.uuid === data.uuid ? { ...subTask, ...data } : subTask
      )
    );
  }

  function deleteSubtask(uuid: string) {
    setSubTaskList((prev) => [...prev].filter((t) => t.uuid !== uuid));
  }

  function toggleLabel(label: string) {
    const currentLabels = form.getValues("labels");
    if (currentLabels.includes(label)) {
      form.setValue(
        "labels",
        currentLabels.filter((l) => l !== label)
      );
    } else {
      form.setValue("labels", [...currentLabels, label]);
    }
  }

  function removeLabel(label: string) {
    const currentLabels = form.getValues("labels");
    form.setValue(
      "labels",
      currentLabels.filter((l) => l !== label)
    );
  }

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg w-full max-w-3xl h-[95vh] flex flex-col">
          <div className="flex justify-between mb-2">
            <div className="flex items-center gap-10">
              <h2 className="text-xl font-semibold">
                {task ? "Éditer la tâche" : "Nouvelle tâche"}
              </h2>
              {/*  
              - create AI buttons to trigger openAi data fetching for each field 
              - create AI settings modal to set fields applied to global AI button 
              */}

              <Button
                variant="ghost"
                className="hover:bg-transparent p-0 mt-1"
                onClick={fetchAISuggestedValues}
              >
                <Sparkles size={16} className="" />
                <span className="italic text-sm">Remplir les champs</span>
              </Button>
            </div>
            <Button
              variant="ghost"
              className="hover:bg-transparent"
              onClick={closeModal}
            >
              <X size={32} className="!size-6" />
            </Button>
          </div>
          <Form {...form}>
            <form
              id="task-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                {/* Main content - left side */}
                <div className="flex-1 px-6 pt-6 flex flex-col">
                  <div className="space-y-2 flex-1 flex flex-col">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem className="mb-4">
                          <FormLabel className="block mb-1">
                            Titre{" "}
                            <span className="text-xs text-gray-800  font-normal">
                              (utilisé pour remplir les autres champs{" "}
                              <Sparkles size={12} className="inline" />)
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="w-full p-2 border rounded"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className="mb-4 flex-1 flex flex-col">
                          <FormLabel className="block mb-1">
                            Description{" "}
                            <span className="text-xs text-gray-800  font-normal">
                              (utilisé pour remplir les autres champs{" "}
                              <Sparkles size={12} className="inline" />)
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              className="w-full p-2 border rounded flex-1"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Properties - right side */}
                <div className="md:w-[300px] p-6 space-y-4 bg-muted/20 flex flex-col">
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem className="mb-4">
                          <FormLabel className="block mb-1">Statut</FormLabel>
                          <FormControl>
                            <select
                              {...field}
                              className="w-full px-2 border rounded h-7"
                              onChange={(e) => field.onChange(e.target.value)}
                              value={field.value}
                            >
                              <option value="backlog">Backlog</option>
                              <option value="ready">Ready</option>
                              <option value="in-progress">In Progress</option>
                              <option value="done">Done</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem className="mb-4">
                          <FormLabel className="block mb-1">
                            Importance
                          </FormLabel>
                          <FormControl>
                            <select
                              {...field}
                              className="w-full px-2 border rounded h-7"
                              onChange={(e) => field.onChange(e.target.value)}
                              value={field.value}
                            >
                              <option value="low">Basse</option>
                              <option value="medium">Medium</option>
                              <option value="high">Haute</option>
                              <option value="urgent">Urgent</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => {
                      return (
                        <FormItem className="flex flex-col !mt-2">
                          <FormLabel>Écheance</FormLabel>
                          <Popover
                            open={openDueDatePopover}
                            onOpenChange={setOpenDueDatePopover}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  " pl-3 text-left font-normal flex justify-between h-7",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  <>
                                    <span>{format(field.value, "PPP")}</span>
                                    <div
                                      onClick={(e) => (
                                        e.stopPropagation(),
                                        form.resetField("dueDate")
                                      )}
                                    >
                                      <CircleX className="h-4 w-4" />
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <span>Choisir une date</span>
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-auto p-0"
                              align="start"
                            >
                              <Calendar
                                mode="single"
                                selected={field.value ?? undefined}
                                onSelect={(date) => {
                                  field.onChange(date);
                                  setOpenDueDatePopover(false);
                                }}
                                disabled={(date) => date < new Date()}
                                initialFocus
                                defaultMonth={field.value ?? new Date()}
                              />
                            </PopoverContent>
                          </Popover>
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="estimatedTime"
                    render={({ field }) => (
                      <FormItem className="mb-4">
                        <FormLabel className="block mb-1">
                          Temps estimé (jours)
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="w-full p-2 border rounded bg-white !h-7"
                            type="number"
                            min={0}
                            step={1}
                            value={field.value ?? ""}
                            placeholder="Enter days"
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value ? Number(value) : null);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="labels"
                    render={({ field }) => (
                      <FormItem className="mb-4">
                        <FormControl>
                          <Popover
                            open={openLabelsPopover}
                            onOpenChange={(isOpen) => {
                              setOpenLabelsPopover(isOpen);
                            }}
                            {...field}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                className="w-full justify-between text-xs h-8 p-0"
                              >
                                <FormLabel>Étiquettes</FormLabel>
                                <span>
                                  <Settings />
                                </span>
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[200px] p-0">
                              <Command>
                                <CommandInput placeholder="Search labels..." />
                                <CommandList>
                                  <CommandEmpty>
                                    Aucune étiquette trouvée.
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {availableLabels.map((label) => (
                                      <CommandItem
                                        key={label}
                                        value={label}
                                        onSelect={toggleLabel}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            field.value.includes(label)
                                              ? "opacity-100"
                                              : "opacity-0"
                                          )}
                                        />
                                        {label}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                  <CommandGroup>
                                    {suggestedLabels.map((label) => (
                                      <CommandItem
                                        key={label}
                                        value={label}
                                        onSelect={toggleLabel}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            field.value.includes(label)
                                              ? "opacity-100"
                                              : "opacity-0"
                                          )}
                                        />
                                        {label}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </FormControl>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2 mb-2">
                            {field.value.map((label) => (
                              <Badge
                                key={label}
                                variant="secondary"
                                className="flex items-center gap-1"
                              >
                                {label}
                                <X
                                  className="h-3 w-3 cursor-pointer"
                                  onClick={() => removeLabel(label)}
                                />
                              </Badge>
                            ))}
                            {field.value.length === 0 && (
                              <span className="text-muted-foreground text-xs">
                                Aucune étiquette.
                              </span>
                            )}
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormItem className="mb-4 overflow-hidden flex flex-col ">
                    <div className="flex items-center justify-between">
                      <FormLabel className="block mb-1">Sous-tâches</FormLabel>
                      <Button
                        variant="ghost"
                        className="text-xs p-0"
                        onClick={(e) => {
                          e.preventDefault();
                          openSubTaskModal();
                        }}
                      >
                        <Plus />
                        Créer
                      </Button>
                    </div>
                    <div className="space-y-2 pr-1 overflow-auto">
                      {subTaskList.map((subTask, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-background rounded-md border p-2 h-8 text-xs"
                        >
                          <span className="truncate flex-1">
                            {subTask.name}
                          </span>
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.preventDefault();
                                openSubTaskModal(subTask);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={(e) => {
                                e.preventDefault();
                                deleteSubtask(subTask.uuid!); //TODO fix
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {subTaskList.length === 0 && (
                        <span className="text-muted-foreground text-xs">
                          Aucune sous-tâche.
                        </span>
                      )}
                    </div>
                  </FormItem>
                </div>
              </div>
            </form>
          </Form>
          <div className="flex justify-end p-4">
            <Button
              type="button"
              variant="secondary"
              onClick={closeModal}
              className="mr-2 px-4 py-2 hover:opacity-80"
            >
              Annuler
            </Button>
            <Button
              className="px-4 py-2 text-white"
              type="submit"
              form="task-form"
            >
              {task ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </div>
      </div>
      <SubTaskModal
        onSubTaskCreate={addSubTask}
        onSubTaskUpdate={updateSubTask}
      />
    </>
  );
}
